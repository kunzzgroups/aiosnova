/**
 * Assistant retrieval service.
 *
 * Ties the composer's Agent picker to the Knowledge bases the agent is
 * linked to. Given a question, it scans the agent's linked bases for
 * matching documents and returns them as evidence.
 *
 * In the mock this is a keyword match; the real backend swaps the body for
 * a vector search while keeping the same signature.
 *
 * Permission: the caller passes the ACTIVE company. Only agents owned by
 * that company are searched, so a company can never see another company's
 * agent results.
 */

import type { AssistantSource, SourceType } from '../types/assistant'
import { getMockState } from '@/modules/ai/mock/mockStore'

export type RetrieveEvidencePayload = {
  agentId: string
  question: string
  activeCompanyId: string
}

export type RetrieveEvidenceResult = {
  sources: AssistantSource[]
  scanned: number
  matched: number
  scope: string
}

export async function retrieveEvidence(
  payload: RetrieveEvidencePayload,
): Promise<RetrieveEvidenceResult> {
  const state = getMockState()

  const agent = state.agents.find(
    (a) => a.id === payload.agentId && a.companyId === payload.activeCompanyId,
  )
  if (!agent) {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }

  const baseIds = agent.knowledgeBaseIds
  const bases = state.bases.filter((b) => baseIds.includes(b.id))
  if (bases.length === 0) {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }
  const baseById = new Map(bases.map((b) => [b.id, b]))

  // 3. Documents in those bases. Only READY docs are searchable — a doc
  //    still processing has no chunks yet.
  const documents = state.documents
    .filter((doc) => baseIds.includes(doc.baseId))
    .filter((doc) => doc.status === 'ready')

  // 4. Score by keyword overlap with the question. Match against BOTH the
  //    document title (weight 2) and the base name (weight 1), so a doc
  //    whose title doesn't contain the term is still found when its base does.
  const tokens = tokenize(payload.question)
  const scored = documents
    .map((doc) => ({
      doc,
      score: scoreDocument(doc, baseById.get(doc.baseId), tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const sources: AssistantSource[] = scored.map(({ doc, score }) => {
    const base = baseById.get(doc.baseId)
    return {
      id: doc.id,
      type: toSourceType(doc.type),
      title: doc.title,
      origin: base ? base.name : doc.baseId,
      snippet: buildSnippet(doc.title, payload.question),
      kind: doc.kind,
      relevance: Math.min(100, Math.round(score * 20)),
      baseId: doc.baseId,
      documentId: doc.id,
    }
  })

  return {
    sources,
    scanned: documents.length,
    matched: scored.length,
    scope: bases.map((b) => b.name).join(', '),
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .filter((token) => token.length >= 2)
}

/**
 * Title match is worth more than a base-name match. This lets a doc called
 * "image (3).png" still be found when the user asks "customer" and its base
 * is "Customer Knowledge".
 */
function scoreDocument(
  doc: { title: string },
  base: { name: string } | undefined,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0
  const title = doc.title.toLowerCase()
  const baseName = base ? base.name.toLowerCase() : ''
  let score = 0
  for (const token of tokens) {
    if (title.includes(token)) {
      score += 2
    } else if (baseName.includes(token)) {
      score += 1
    }
  }
  return score
}

function toSourceType(value: string): SourceType {
  if (value === 'contract') return 'contract'
  if (value === 'invoice') return 'invoice'
  if (value === 'record') return 'record'
  return 'policy'
}

function buildSnippet(title: string, question: string): string {
  return `Matched "${question}" in ${title}.`
}

