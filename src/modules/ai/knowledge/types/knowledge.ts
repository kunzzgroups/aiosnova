/**
 * Shapes the Knowledge screen renders.
 *
 * A knowledge base is the unit the AI Assistant searches: it groups the documents
 * of ONE company, so a question asked from the company switcher can only ever be
 * answered from that company's material.
 *
 * Naming: the countable thing is a DOCUMENT (what the screen lists, "Add source"
 * is the action that creates one). `kind` stays `file | record` because the
 * assistant's `AssistantSource` already uses that vocabulary.
 *
 * Only reads are wired up for now. `companyId` is on the record from the start so
 * a later `assistantScopes` rewrite (type-based -> base-based) needs no migration.
 */

import type { AssignmentSource } from '@/modules/ai/shared/assignment'

/** Roll-up shown on the knowledge base list. Derived from its documents. */
export type KnowledgeBaseStatus = 'ready' | 'processing' | 'failed' | 'empty'

/** Ingestion state of a single document. */
export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'failed'

/** Mirrors `SourceKind` in the assistant, so both screens agree. */
export type KnowledgeDocumentKind = 'file' | 'record'
export type KnowledgeDocumentType = 'contract' | 'invoice' | 'policy' | 'record'

export type KnowledgeBase = {
  id: string
  tenantId: string
  /** Owning company. Never null - a base belongs to exactly one company. */
  companyId: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export type KnowledgeDocument = {
  id: string
  baseId: string
  kind: KnowledgeDocumentKind
  type: KnowledgeDocumentType
  /** File name for `kind: 'file'`, record title for `kind: 'record'`. */
  title: string
  status: KnowledgeDocumentStatus
  /** Passages the indexer produced. 0 until ingestion finishes. */
  chunkCount: number
  sizeBytes: number
  uploadedAt: string
  lastIndexedAt: string | null
}

/**
 * List row. Counts are computed by the service from the FULL document set, so the
 * list and the detail screen can never disagree.
 */
export type KnowledgeBaseListItem = KnowledgeBase & {
  documentCount: number
  agentCount: number
  status: KnowledgeBaseStatus
}

export type KnowledgeBaseDetail = {
  base: KnowledgeBaseListItem
  documents: KnowledgeDocument[]
  /** Effective agents per document, resolved by the service (override beats base). */
  effective: DocumentEffectiveAgents[]
  /** Base-level default; drives the tick state on the Agents tab. */
  baseAgentIds: string[]
}

/** Which agents a single document currently reaches, and which level decided it. */
export type DocumentEffectiveAgents = {
  documentId: string
  agentIds: string[]
  source: AssignmentSource
}

/** Roll-up rule, shared by the mock service and any future backend. */
export function deriveBaseStatus(
  documents: Array<Pick<KnowledgeDocument, 'status'>>,
): KnowledgeBaseStatus {
  if (documents.length === 0) {
    return 'empty'
  }
  if (documents.some((document) => document.status === 'failed')) {
    return 'failed'
  }
  if (documents.some((document) => document.status === 'processing')) {
    return 'processing'
  }
  return 'ready'
}
