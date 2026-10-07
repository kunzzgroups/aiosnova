import { HttpResponse, http } from 'msw'
import { knowledgeBases, knowledgeDocuments } from '@/mocks/data/knowledge'
import { agentDocumentLinks, agentKnowledgeLinks } from '@/mocks/data/agents'
import { DEMO_MERCHANT_ID } from '@/mocks/data/identity'
import {
  deriveBaseStatus,
  type KnowledgeBase,
  type KnowledgeBaseListItem,
  type KnowledgeDocument,
} from '@/modules/ai/knowledge/types/knowledge'
import { resolveBaseAgentIds, resolveEffectiveAgents } from '@/modules/ai/shared/assignment'

/**
 * Knowledge reads, plus the knowledge-side half of the agent <-> knowledge
 * relation.
 *
 * The relation tables live in `mocks/data/agents.ts` and are shared with
 * `agentHandlers` - the two screens write the same rows, so neither can drift.
 *
 * Create / upload / delete stay unwired: the screen is a shell for those, and a
 * fake local mutation would be contradicted the moment a backend exists.
 */

/** Counts and roll-up status are computed from the full document set, never stored. */
function toListItem(baseId: string): KnowledgeBaseListItem | null {
  const base = knowledgeBases.find((item) => item.id === baseId)
  if (!base) {
    return null
  }
  const documents = knowledgeDocuments.filter((document) => document.baseId === baseId)
  return {
    ...base,
    documentCount: documents.length,
    agentCount: resolveBaseAgentIds(
      baseId,
      documents.map((document) => document.id),
      agentKnowledgeLinks,
      agentDocumentLinks,
    ).length,
    status: deriveBaseStatus(documents),
  }
}

/** Replace a base's default ticks wholesale. Overrides are untouched. */
function setBaseAgents(baseId: string, agentIds: string[]) {
  for (let index = agentKnowledgeLinks.length - 1; index >= 0; index -= 1) {
    if (agentKnowledgeLinks[index].baseId === baseId) {
      agentKnowledgeLinks.splice(index, 1)
    }
  }
  const assignedAt = new Date().toISOString()
  for (const agentId of agentIds) {
    agentKnowledgeLinks.push({ agentId, baseId, assignedAt })
  }
}

/** `null` clears the override, so the document inherits its base again. */
function setDocumentAgents(documentId: string, agentIds: string[] | null) {
  for (let index = agentDocumentLinks.length - 1; index >= 0; index -= 1) {
    if (agentDocumentLinks[index].documentId === documentId) {
      agentDocumentLinks.splice(index, 1)
    }
  }
  if (agentIds === null) {
    return
  }
  const assignedAt = new Date().toISOString()
  for (const agentId of agentIds) {
    agentDocumentLinks.push({ agentId, documentId, assignedAt })
  }
}

export const knowledgeHandlers = [
  http.get('/api/knowledge/bases', ({ request }) => {
    const companyId = new URL(request.url).searchParams.get('companyId')
    const items = knowledgeBases
      .filter((base) => !companyId || base.companyId === companyId)
      .map((base) => toListItem(base.id))
      .filter((item): item is KnowledgeBaseListItem => item !== null)

    return HttpResponse.json({ items })
  }),

  http.get('/api/knowledge/bases/:baseId', ({ params }) => {
    const baseId = String(params.baseId)
    const base = toListItem(baseId)
    if (!base) {
      return HttpResponse.json({ message: 'Knowledge base not found.' }, { status: 404 })
    }

    const documents = knowledgeDocuments.filter((document) => document.baseId === baseId)
    return HttpResponse.json({
      base,
      documents,
      /** Effective agents per document - the screen does not re-derive this. */
      effective: documents.map((document) => ({
        documentId: document.id,
        ...resolveEffectiveAgents(
          document.id,
          baseId,
          agentKnowledgeLinks,
          agentDocumentLinks,
        ),
      })),
      /** Base-level default; drives the tick state on the Agents tab. */
      baseAgentIds: agentKnowledgeLinks
        .filter((link) => link.baseId === baseId)
        .map((link) => link.agentId),
    })
  }),

  http.post('/api/knowledge/bases', async ({ request }) => {
    const body = (await request.json()) as {
      name?: string
      description?: string
      companyId?: string
      agentIds?: string[]
    }

    const name = (body.name ?? '').trim()
    if (!name) {
      return HttpResponse.json({ message: 'Knowledge base name is required.' }, { status: 422 })
    }
    if (!body.companyId) {
      return HttpResponse.json({ message: 'companyId is required.' }, { status: 422 })
    }

    const createdAt = new Date().toISOString()
    const created: KnowledgeBase = {
      id: `kb_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      merchantId: DEMO_MERCHANT_ID,
      companyId: body.companyId,
      name,
      description: (body.description ?? '').trim(),
      createdAt,
      updatedAt: createdAt,
    }
    knowledgeBases.push(created)
    /** Agents ticked at creation are base-level defaults; there is nothing to override yet. */
    setBaseAgents(created.id, body.agentIds ?? [])

    return HttpResponse.json(toListItem(created.id), { status: 201 })
  }),

  http.patch('/api/knowledge/bases/:baseId', async ({ params, request }) => {
    const baseId = String(params.baseId)
    const base = knowledgeBases.find((item) => item.id === baseId)
    if (!base) {
      return HttpResponse.json({ message: 'Knowledge base not found.' }, { status: 404 })
    }

    const body = (await request.json()) as { name?: string; description?: string }
    if (typeof body.name === 'string' && body.name.trim()) {
      base.name = body.name.trim()
    }
    if (typeof body.description === 'string') {
      base.description = body.description.trim()
    }
    base.updatedAt = new Date().toISOString()

    return HttpResponse.json(toListItem(baseId))
  }),

  http.delete('/api/knowledge/bases/:baseId', ({ params }) => {
    const baseId = String(params.baseId)
    const index = knowledgeBases.findIndex((item) => item.id === baseId)
    if (index === -1) {
      return HttpResponse.json({ message: 'Knowledge base not found.' }, { status: 404 })
    }
    knowledgeBases.splice(index, 1)

    // The documents go with it, and so does every agent link that pointed at the
    // base OR at one of those documents - otherwise the relation tables keep rows
    // referring to records that no longer exist.
    const removedDocumentIds = new Set(
      knowledgeDocuments
        .filter((document) => document.baseId === baseId)
        .map((document) => document.id),
    )
    for (let i = knowledgeDocuments.length - 1; i >= 0; i -= 1) {
      if (knowledgeDocuments[i].baseId === baseId) {
        knowledgeDocuments.splice(i, 1)
      }
    }
    for (let i = agentKnowledgeLinks.length - 1; i >= 0; i -= 1) {
      if (agentKnowledgeLinks[i].baseId === baseId) {
        agentKnowledgeLinks.splice(i, 1)
      }
    }
    for (let i = agentDocumentLinks.length - 1; i >= 0; i -= 1) {
      if (removedDocumentIds.has(agentDocumentLinks[i].documentId)) {
        agentDocumentLinks.splice(i, 1)
      }
    }

    return new HttpResponse(null, { status: 204 })
  }),

  http.put('/api/knowledge/bases/:baseId/agents', async ({ params, request }) => {
    const baseId = String(params.baseId)
    if (!knowledgeBases.some((base) => base.id === baseId)) {
      return HttpResponse.json({ message: 'Knowledge base not found.' }, { status: 404 })
    }

    const body = (await request.json()) as { agentIds?: string[] }
    if (!Array.isArray(body.agentIds)) {
      return HttpResponse.json({ message: 'agentIds must be an array.' }, { status: 422 })
    }
    setBaseAgents(baseId, body.agentIds)

    return HttpResponse.json(toListItem(baseId))
  }),

  http.post('/api/knowledge/bases/:baseId/documents', async ({ params, request }) => {
    const baseId = String(params.baseId)
    if (!knowledgeBases.some((base) => base.id === baseId)) {
      return HttpResponse.json({ message: 'Knowledge base not found.' }, { status: 404 })
    }

    const body = (await request.json()) as {
      title?: string
      type?: KnowledgeDocument['type']
      agentIds?: string[] | null
    }

    const title = (body.title ?? '').trim()
    if (!title) {
      return HttpResponse.json({ message: 'Document name is required.' }, { status: 422 })
    }

    const createdAt = new Date().toISOString()
    const created: KnowledgeDocument = {
      id: `doc_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      baseId,
      kind: 'file',
      type: body.type ?? 'policy',
      title,
      /** A real backend queues ingestion here; nothing advances it in the mock. */
      status: 'processing',
      chunkCount: 0,
      sizeBytes: title.length * 4096,
      uploadedAt: createdAt,
      lastIndexedAt: null,
    }
    knowledgeDocuments.push(created)

    /** `null` means "inherit the base", so no override row is written. */
    if (body.agentIds !== null && body.agentIds !== undefined) {
      setDocumentAgents(created.id, body.agentIds)
    }

    return HttpResponse.json(created, { status: 201 })
  }),

  http.put('/api/knowledge/documents/:documentId/agents', async ({ params, request }) => {
    const documentId = String(params.documentId)
    const document = knowledgeDocuments.find((item) => item.id === documentId)
    if (!document) {
      return HttpResponse.json({ message: 'Document not found.' }, { status: 404 })
    }

    const body = (await request.json()) as { agentIds?: string[] | null }
    if (body.agentIds !== null && !Array.isArray(body.agentIds)) {
      return HttpResponse.json(
        { message: 'agentIds must be an array or null to clear the override.' },
        { status: 422 },
      )
    }
    setDocumentAgents(documentId, body.agentIds)

    return HttpResponse.json({
      documentId,
      ...resolveEffectiveAgents(
        documentId,
        document.baseId,
        agentKnowledgeLinks,
        agentDocumentLinks,
      ),
    })
  }),
]
