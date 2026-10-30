/**
 * Assistant retrieval service.
 *
 * Ties the composer's Agent picker to the Knowledge bases the agent is
 * linked to. Given a question, it scans the agent's linked bases for
 * matching documents and returns them as evidence.
 *
 * Requests indexed text from Java. Company, active Agent and document-level
 * assignment rules are enforced by the server; metadata is not used as evidence.
 *
 * Permission: the caller passes the ACTIVE company. Only ACTIVE agents owned
 * by that company are searched, and only bases visible from that company are
 * considered.
 */

import type { AssistantSource } from '../types/assistant'
import { knowledgeRequest } from '@/modules/ai/knowledge/services/knowledgeApi'

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

  return knowledgeRequest<RetrieveEvidenceResult>('/search', {
    method: 'POST', body: {
      companyId: payload.activeCompanyId,
      agentId: payload.agentId,
      question: payload.question,
    },
  })
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
