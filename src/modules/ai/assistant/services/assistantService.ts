/**
 * Assistant retrieval service.
 *
 * Ties the composer's Agent picker to the Knowledge bases the agent is
 * linked to. Given a question, it scans the agent's linked bases for
 * matching documents and returns them as evidence.
 *
 * Reads the stored Agent/Knowledge catalog. Matching here remains a metadata
 * keyword match; unindexed documents are excluded. Vector retrieval belongs to
 * the ingestion/search backend.
 *
 * Permission: the caller passes the ACTIVE company. Only ACTIVE agents owned
 * by that company are searched, and only bases visible from that company are
 * considered.
 */

import type { AssistantSource, SourceType } from '../types/assistant'
import { documentIsRetrievable } from '@/modules/ai/knowledge/types/knowledge'
import { fetchAgent } from '@/modules/ai/agents/services/agentService'
import { fetchKnowledgeBases, fetchKnowledgeBase } from '@/modules/ai/knowledge/services/knowledgeService'

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
  if (!shouldRetrieveEvidence(payload.question)) {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }

  const { agent } = await fetchAgent(payload.agentId, payload.activeCompanyId)
  if (agent.companyId !== payload.activeCompanyId || agent.status !== 'active') {
    return { sources: [], scanned: 0, matched: 0, scope: '' }
  }
  const assignedBaseIds = new Set(agent.knowledgeBaseIds)
  const { items } = await fetchKnowledgeBases(payload.activeCompanyId)
  const bases = items.filter(base => assignedBaseIds.has(base.id))
  const baseById = new Map(bases.map(base => [base.id, base]))
  const details = await Promise.all(bases.map(base => fetchKnowledgeBase(base.id, payload.activeCompanyId)))
  // Stored catalog metadata is not an indexed document. Never cite unprocessed uploads.
  const documents = details.flatMap(detail => detail.documents.filter(doc =>
    documentIsRetrievable(doc) && doc.chunkCount > 0 && Boolean(doc.lastIndexedAt) &&
    detail.effective.find(link => link.documentId === doc.id)?.agentIds.includes(agent.id),
  ))

  // Score by keyword overlap with the question. Match against BOTH the
  // document title (weight 2) and the base name (weight 1).
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
      snippet: buildSnippet(base?.name),
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
    scope: bases.map((base) => base.name).join(', '),
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CASUAL_CHAT = new Set([
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you',
  '你好',
  '您好',
  '嗨',
  '谢谢',
])

const RETRIEVAL_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'how',
  'can',
  'could',
  'would',
  'should',
  'please',

  // Common code vocabulary. These terms are too generic to be useful
  // Knowledge matches and are the source of many false-positive citations.
  'import',
  'export',
  'const',
  'let',
  'var',
  'function',
  'class',
  'return',
  'type',
  'interface',
  'string',
  'number',
  'boolean',
  'react',
  'useeffect',
  'usestate',
  'usememo',
  'usecallback',
  'useref',

  // Generic product nouns should not cause a match by themselves.
  'knowledge',
  'document',
  'documents',
  'agent',
  'agents',
  'source',
  'sources',
  'status',
  'template',
  'templates',
])

/**
 * Keep retrieval content-driven rather than "full question only".
 *
 * Examples:
 *   HR                  -> true
 *   annual leave        -> true
 *   invoice             -> true
 *   import {...} React  -> false
 *   hello               -> false
 */
export function shouldRetrieveEvidence(question: string): boolean {
  const text = question.trim()
  if (!text) return false

  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()

  if (CASUAL_CHAT.has(normalized)) {
    return false
  }

  if (looksLikeCode(text)) {
    return false
  }

  // Any remaining business/domain text is allowed to search. If it has no
  // meaningful match, retrieveEvidence simply returns zero sources and the
  // Assistant turn remains a normal chat turn.
  return tokenize(text).length > 0
}

function looksLikeCode(text: string): boolean {
  const trimmed = text.trim()

  const strongSignals = [
    /^\s*(import|export)\s+/m,
    /^\s*(const|let|var)\s+\w+\s*=/m,
    /^\s*(function|class|interface|type)\s+\w+/m,
    /from\s+['"][^'"]+['"]/m,
    /=>/,
    /<\/?[A-Z][A-Za-z0-9.]*(?:\s|>|\/>)/,
  ]

  if (strongSignals.some((pattern) => pattern.test(trimmed))) {
    return true
  }

  const lines = trimmed.split(/\r?\n/)
  if (lines.length < 3) {
    return false
  }

  // Multi-line text with several programming punctuation markers is almost
  // certainly pasted code. A short keyword such as "HR" can never hit this.
  const punctuationHits = [
    /[{}]/,
    /;\s*$/m,
    /\(\s*[^)]*\)\s*[{=>]/,
    /\[[^\]]*\]/,
  ].filter((pattern) => pattern.test(trimmed)).length

  return punctuationHits >= 2
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/g)
        .filter((token) => token.length >= 2)
        .filter((token) => !RETRIEVAL_STOP_WORDS.has(token)),
    ),
  )
}

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

function buildSnippet(baseName?: string): string {
  return baseName
    ? `Matched from ${baseName} by document title or knowledge-base metadata.`
    : 'Matched by document title or knowledge-base metadata.'
}
