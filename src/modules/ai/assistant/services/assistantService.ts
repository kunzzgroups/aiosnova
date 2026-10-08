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

  // 1. The agent must belong to the active company.
  const agent = state.agents.find(
    (a) =>
      a.id === payload.agentId && a.companyId === payload.activeCompanyId,
  )
  if (!agent) {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }

  // 2. Bases the agent may search.
  const baseIds = agent.knowledgeBaseIds
  const bases = state.bases.filter((b) => baseIds.includes(b.id))
  if (bases.length === 0) {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }

  // 3. Documents in those bases.
  const documents = state.documents.filter((doc) =>
    baseIds.includes(doc.baseId),
  )

  // 4. Score by keyword overlap with the question.
  const tokens = tokenize(payload.question)
  const scored = documents
    .map((doc) => ({
      doc,
      score: scoreDocument(doc.title, tokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const sources: AssistantSource[] = scored.map(({ doc, score }) => {
    const base = bases.find((b) => b.id === doc.baseId)
    return {
      id: doc.id,
      type: toSourceType(doc.type),
      title: doc.title,
      origin: base ? base.name : doc.baseId,
      snippet: buildSnippet(doc.title, payload.question),
      kind: doc.kind,
      relevance: Math.min(100, Math.round(score * 25)),
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

function scoreDocument(title: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const haystack = title.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1
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