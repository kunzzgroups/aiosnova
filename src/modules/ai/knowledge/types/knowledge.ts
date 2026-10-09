/**
 * Shapes the Knowledge screen renders.
 *
 * A knowledge base is the unit the AI Assistant searches: it groups the documents
 * of ONE company, so a question asked from the company switcher can only ever be
 * answered from that company's material.
 *
 * A base comes in three kinds:
 *   - `document`: files / records, indexed for retrieval (RAG).
 *   - `skill`:    a callable capability the assistant can invoke.
 *   - `data`:     a structured source (table / API / database) queried at runtime.
 *
 * Only reads are wired up for now. `companyId` is on the record from the start so
 * a later `assistantScopes` rewrite (type-based -> base-based) needs no migration.
 */

import type { AssignmentSource } from '@/modules/ai/shared/assignment'

/** Roll-up shown on the knowledge base list. Derived from its documents. */
export type KnowledgeBaseStatus = 'ready' | 'processing' | 'failed' | 'empty'

/** What lives inside a base. Defaults to `document` when omitted. */
export type KnowledgeBaseKind = 'document' | 'skill' | 'data'

/** Ingestion state of a single document. */
export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'failed'

/** Mirrors `SourceKind` in the assistant, so both screens agree. */
export type KnowledgeDocumentKind = 'file' | 'record'
export type KnowledgeDocumentType = 'contract' | 'invoice' | 'policy' | 'record'

export type KnowledgeBase = {
  id: string
  merchantId: string
  /** Owning company. Write permission is gated by this. */
  companyId: string
  /**
   * Which companies may READ this base (search, list, AI citation).
   * Always includes the owner. Empty or missing = only the owner can read.
   */
  allowedCompanyIds?: string[]
  name: string
  description: string
  category?: string
  kind?: KnowledgeBaseKind
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
  chunkCount: number
  sizeBytes: number
  uploadedAt: string
  lastIndexedAt: string | null
  /** Object URL (mock) or storage URL (real). Absent for record-only entries. */
  fileUrl?: string
  /** MIME type of the original file. Absent for record-only entries. */
  mimeType?: string
}

/** A callable capability inside a `kind: 'skill'` base. */
export type KnowledgeSkill = {
  id: string
  baseId: string
  name: string
  description: string
  /** JSON-schema-ish preview of the inputs, rendered as a read-only snippet. */
  inputSchema?: Record<string, unknown>
  status: 'draft' | 'ready' | 'failed'
  updatedAt: string
}

/** A structured source inside a `kind: 'data'` base. */
export type KnowledgeDataSource = {
  id: string
  baseId: string
  name: string
  kind: 'table' | 'api' | 'database'
  /** Non-secret config only. Render as key/value chips. */
  config: Record<string, string>
  status: 'connected' | 'disconnected' | 'error'
  lastSyncedAt: string | null
}

/**
 * List row. Counts are computed by the service from the FULL document set, so the
 * list and the detail screen can never disagree.
 */
export type KnowledgeBaseListItem = KnowledgeBase & {
  documentCount: number
  agentCount: number
  status: KnowledgeBaseStatus
  /**
   * Base-level agent IDs, i.e. the agents this base is ticked for on the Agents
   * tab. Optional so a list endpoint may omit it; the `?agentId=` deep link on
   * KnowledgeBasesPage reads it to filter client-side. Same relation the
   * AgentsPage writes through `PATCH /api/agents/:id`.
   */
  agentIds?: string[]
}

export type KnowledgeBaseDetail = {
  base: KnowledgeBaseListItem
  documents: KnowledgeDocument[]
  skills: KnowledgeSkill[]
  dataSources: KnowledgeDataSource[]
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
