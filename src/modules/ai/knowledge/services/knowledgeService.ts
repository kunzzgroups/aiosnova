import { apiRequest } from '@/services/httpClient'
import { ApiError } from '@/services/httpClient'
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseListItem,
  KnowledgeDocument,
  KnowledgeDocumentType,
  KnowledgeDataSource,
  KnowledgeSkill,
} from '../types/knowledge'
import {
  agentIdsForBase,
  effectiveAgentIdsForDocument,
  getMockState,
  listBasesVisibleFrom,
  nextId,
  setBaseAgents,
  setDocumentOverride,
  toBaseListItem,
} from '@/modules/ai/mock/mockStore'
import { MOCK_USER, canWriteToCompany } from '@/modules/ai/mock/permissions'

const USE_MOCK = true

/**
 * Bases visible while acting as `activeCompanyId`.
 *
 * The rule lives in `listBasesVisibleFrom` so the AI, the backend, and this
 * service all share it. A user who is a member of A and B but is currently
 * "in" A does not see B's private bases here.
 */
export async function fetchKnowledgeBases(
  companyId: string,
): Promise<{ items: KnowledgeBaseListItem[] }> {
  if (USE_MOCK) {
    return {
      items: listBasesVisibleFrom(MOCK_USER, companyId).map(toBaseListItem),
    }
  }

  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<{ items: KnowledgeBaseListItem[] }>(
    `/api/knowledge-bases${query}`,
    { auth: true },
  )
}

export async function fetchKnowledgeBase(
  baseId: string,
): Promise<KnowledgeBaseDetail> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) {
      throw new Error(`Knowledge base ${baseId} not found`)
    }

    const documents: KnowledgeDocument[] = state.documents
      .filter((doc) => doc.baseId === baseId)
      .map((doc) => ({
        id: doc.id,
        baseId: doc.baseId,
        kind: doc.kind,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        chunkCount: doc.chunkCount,
        sizeBytes: doc.sizeBytes,
        uploadedAt: doc.uploadedAt,
        lastIndexedAt: doc.lastIndexedAt,
        fileUrl: doc.fileUrl,
        mimeType: doc.mimeType,
      }))

    const skills = state.skills
      .filter((skill) => skill.baseId === baseId)
      .map((skill) => ({ ...skill }))

    const dataSources = state.dataSources
      .filter((ds) => ds.baseId === baseId)
      .map((ds) => ({ ...ds, config: { ...ds.config } }))

    const effective = documents.map((doc) => {
      const { agentIds, source } = effectiveAgentIdsForDocument(doc.id)
      return { documentId: doc.id, agentIds, source }
    })

    return {
      base: toBaseListItem(base),
      documents,
      skills,
      dataSources,
      effective,
      baseAgentIds: agentIdsForBase(baseId),
    }
  }

  return apiRequest<KnowledgeBaseDetail>(`/api/knowledge-bases/${baseId}`, {
    auth: true,
  })
}

/* ------------------------------------------------------------------ */
/* Guarded writes                                                      */
/* ------------------------------------------------------------------ */

export async function createKnowledgeBase(payload: {
  name: string
  description: string
  companyId: string
  agentIds: string[]
  kind?: 'document' | 'skill' | 'data'
  category?: string
}): Promise<KnowledgeBaseListItem> {
  if (USE_MOCK) {
    if (!canWriteToCompany(MOCK_USER, payload.companyId)) {
      throw new ApiError(
        'You do not have permission to create a base in this company.',
        403,
      )
    }
    const state = getMockState()
    const now = new Date().toISOString()
    const base = {
      id: nextId('kb'),
      tenantId: 'tenant-demo',
      companyId: payload.companyId,
      allowedCompanyIds: [payload.companyId],
      name: payload.name,
      description: payload.description,
      category: payload.category ?? 'Other',
      kind: payload.kind ?? 'document',
      createdAt: now,
      updatedAt: now,
      status: 'empty' as const,
    }
    state.bases.push(base)

    setBaseAgents(base.id, payload.agentIds)

    return toBaseListItem(base)
  }

  return apiRequest<KnowledgeBaseListItem>('/api/knowledge-bases', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateKnowledgeBase(
  baseId: string,
  payload: { name?: string; description?: string; category?: string },
): Promise<KnowledgeBaseListItem> {
  if (USE_MOCK) {
    const base = getMockState().bases.find((b) => b.id === baseId)
    if (!base) {
      throw new Error(`Knowledge base ${baseId} not found`)
    }
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to update this base.', 403)
    }

    if (payload.name !== undefined) base.name = payload.name
    if (payload.description !== undefined) base.description = payload.description
    if (payload.category !== undefined) base.category = payload.category
    base.updatedAt = new Date().toISOString()

    return toBaseListItem(base)
  }

  return apiRequest<KnowledgeBaseListItem>(`/api/knowledge-bases/${baseId}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function deleteKnowledgeBase(baseId: string): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) return
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to delete this base.', 403)
    }
    state.bases = state.bases.filter((b) => b.id !== baseId)
    state.documents = state.documents.filter((d) => d.baseId !== baseId)
    state.skills = state.skills.filter((s) => s.baseId !== baseId)
    state.dataSources = state.dataSources.filter((d) => d.baseId !== baseId)

    for (const agent of state.agents) {
      agent.knowledgeBaseIds = agent.knowledgeBaseIds.filter((id) => id !== baseId)
    }

    for (const key of [...state.documentOverrides.keys()]) {
      const stillExists = state.documents.some((d) => d.id === key)
      if (!stillExists) state.documentOverrides.delete(key)
    }
    return
  }

  await apiRequest<void>(`/api/knowledge-bases/${baseId}`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function addKnowledgeDocument(
  baseId: string,
  payload: {
    title: string
    type: KnowledgeDocumentType
    agentIds: string[] | null
    file?: File
  },
): Promise<KnowledgeDocument> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) throw new ApiError(`Base ${baseId} not found`, 404)
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to modify this base.', 403)
    }

    const now = new Date().toISOString()
    const fileUrl = payload.file ? URL.createObjectURL(payload.file) : undefined

    const document: KnowledgeDocument = {
      id: nextId(`${baseId}-doc`),
      baseId,
      kind: payload.file ? 'file' : 'record',
      type: payload.type,
      title: payload.title,
      status: 'processing',
      chunkCount: 0,
      sizeBytes: payload.file?.size ?? 0,
      uploadedAt: now,
      lastIndexedAt: null,
      fileUrl,
      mimeType: payload.file?.type,
    }

    state.documents.push({ ...document })

    if (payload.agentIds !== null) setDocumentOverride(document.id, payload.agentIds)

    base.updatedAt = now

    // Auto ingestion: mostly ready, occasionally failed.
    window.setTimeout(() => {
      const live = state.documents.find((d) => d.id === document.id)
      if (!live) return
      const failed = Math.random() < 0.05
      live.status = failed ? 'failed' : 'ready'
      live.lastIndexedAt = failed ? null : new Date().toISOString()
      if (!failed) live.chunkCount = 12
    }, 1500)

    return document
  }

  const form = new FormData()
  form.append('title', payload.title)
  form.append('type', payload.type)
  form.append('agentIds', JSON.stringify(payload.agentIds))
  if (payload.file) form.append('file', payload.file)

  const response = await fetch(`/api/knowledge-bases/${baseId}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = text
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string }
      message = parsed.message ?? parsed.error ?? text
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(message || `HTTP ${response.status}`, response.status)
  }

  return (await response.json()) as KnowledgeDocument
}

export async function addKnowledgeSkill(
  baseId: string,
  payload: {
    name: string
    description: string
    inputSchema?: Record<string, unknown>
    agentIds: string[] | null
  },
): Promise<KnowledgeSkill> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) throw new ApiError(`Base ${baseId} not found`, 404)
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to modify this base.', 403)
    }

    const now = new Date().toISOString()
    const skill: KnowledgeSkill = {
      id: nextId(`${baseId}-skill`),
      baseId,
      name: payload.name,
      description: payload.description,
      inputSchema: payload.inputSchema,
      // Skill is immediately ready; no draft step.
      status: 'ready',
      updatedAt: now,
    }
    state.skills.push({ ...skill })
    return skill
  }

  return apiRequest<KnowledgeSkill>(
    `/api/knowledge-bases/${baseId}/skills`,
    { method: 'POST', auth: true, body: payload },
  )
}

export async function addKnowledgeDataSource(
  baseId: string,
  payload: {
    name: string
    kind: 'table' | 'api' | 'database'
    config: Record<string, string>
    agentIds: string[] | null
  },
): Promise<KnowledgeDataSource> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) throw new ApiError(`Base ${baseId} not found`, 404)
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to modify this base.', 403)
    }

    const ds: KnowledgeDataSource = {
      id: nextId(`${baseId}-ds`),
      baseId,
      name: payload.name,
      kind: payload.kind,
      config: { ...payload.config },
      status: 'disconnected',
      lastSyncedAt: null,
    }
    state.dataSources.push({ ...ds, config: { ...ds.config } })

    // Auto-connect after a beat; occasionally errors.
    window.setTimeout(() => {
      const live = state.dataSources.find((d) => d.id === ds.id)
      if (!live) return
      const failed = Math.random() < 0.05
      live.status = failed ? 'error' : 'connected'
      live.lastSyncedAt = failed ? null : new Date().toISOString()
    }, 1500)

    return ds
  }

  return apiRequest<KnowledgeDataSource>(
    `/api/knowledge-bases/${baseId}/data-sources`,
    { method: 'POST', auth: true, body: payload },
  )
}

export async function setKnowledgeBaseAgents(
  baseId: string,
  agentIds: string[],
): Promise<void> {
  if (USE_MOCK) {
    setBaseAgents(baseId, agentIds)
    return
  }
  await apiRequest<void>(`/api/knowledge-bases/${baseId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}

export async function setDocumentAgents(
  documentId: string,
  agentIds: string[] | null,
): Promise<void> {
  if (USE_MOCK) {
    setDocumentOverride(documentId, agentIds)
    return
  }
  await apiRequest<void>(`/api/knowledge-documents/${documentId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}

export async function updateKnowledgeDocumentStatus(
  documentId: string,
  status: 'processing' | 'ready' | 'failed',
): Promise<KnowledgeDocument | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const doc = state.documents.find((d) => d.id === documentId)
    if (!doc) return null
    doc.status = status
    doc.lastIndexedAt = status === 'ready' ? new Date().toISOString() : null
    if (status === 'ready') doc.chunkCount = doc.chunkCount || 12
    return {
      id: doc.id, baseId: doc.baseId, kind: doc.kind, type: doc.type,
      title: doc.title, status: doc.status, chunkCount: doc.chunkCount,
      sizeBytes: doc.sizeBytes, uploadedAt: doc.uploadedAt,
      lastIndexedAt: doc.lastIndexedAt, fileUrl: doc.fileUrl, mimeType: doc.mimeType,
    }
  }
  return apiRequest<KnowledgeDocument>(
    `/api/knowledge-documents/${documentId}/status`,
    { method: 'PATCH', auth: true, body: { status } },
  )
}

export async function updateKnowledgeSkillStatus(
  skillId: string,
  status: 'ready' | 'failed',
): Promise<KnowledgeSkill | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const skill = state.skills.find((s) => s.id === skillId)
    if (!skill) return null
    skill.status = status
    skill.updatedAt = new Date().toISOString()
    return { ...skill }
  }
  return apiRequest<KnowledgeSkill>(`/api/knowledge-skills/${skillId}/status`, {
    method: 'PATCH', auth: true, body: { status },
  })
}

export async function updateKnowledgeDataSourceStatus(
  dsId: string,
  status: 'connected' | 'disconnected' | 'error',
): Promise<KnowledgeDataSource | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const ds = state.dataSources.find((d) => d.id === dsId)
    if (!ds) return null
    ds.status = status
    if (status === 'connected') ds.lastSyncedAt = new Date().toISOString()
    return { ...ds, config: { ...ds.config } }
  }
  return apiRequest<KnowledgeDataSource>(
    `/api/knowledge-data-sources/${dsId}/status`,
    { method: 'PATCH', auth: true, body: { status } },
  )
}