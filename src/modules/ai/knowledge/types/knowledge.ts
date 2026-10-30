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

/**
 * Shapes the Knowledge screen renders.
 *
 * System health and user-controlled operating mode are intentionally separate:
 * - status = underlying ingestion / connection / execution health
 * - mode   = whether the user wants the item active, paused, or under testing
 */

import type { AssignmentSource } from '@/modules/ai/shared/assignment'

/**
 * Roll-up shown on the Knowledge Base list/detail header.
 *
 * `paused` and `testing` are user intent, not system failures.
 */
export type KnowledgeBaseStatus =
  | 'ready'
  | 'processing'
  | 'stored_only'
  | 'testing'
  | 'paused'
  | 'failed'
  | 'empty'

/** What lives inside a base. Defaults to `document` when omitted. */
export type KnowledgeBaseKind = 'document' | 'skill' | 'data'

/**
 * User intent. Never use this to represent an infrastructure/system failure.
 * A failed/error system state always takes precedence in the UI and roll-up.
 */
export type KnowledgeManualMode = 'active' | 'paused' | 'testing'

/** Unified display state used by Knowledge UI rows. */
export type KnowledgeItemDisplayStatus =
  | 'ready'
  | 'processing'
  | 'stored_only'
  | 'testing'
  | 'paused'
  | 'failed'

/** Ingestion state of a single document. */
export type KnowledgeDocumentStatus = 'ready' | 'processing' | 'failed' | 'stored_only'

/** Mirrors `SourceKind` in the assistant, so both screens agree. */
export type KnowledgeDocumentKind = 'file' | 'record'
export type KnowledgeDocumentType = 'contract' | 'invoice' | 'policy' | 'record'

export type KnowledgeBase = {
  id: string
  version?: number
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
  version?: number
  baseId: string
  kind: KnowledgeDocumentKind
  type: KnowledgeDocumentType
  /** File name for `kind: 'file'`, record title for `kind: 'record'`. */
  title: string
  status: KnowledgeDocumentStatus
  /** User-controlled operating mode. Defaults to `active` when omitted. */
  mode?: KnowledgeManualMode
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
  version?: number
  baseId: string
  name: string
  description: string
  /** JSON-schema-ish preview of the inputs, rendered as a read-only snippet. */
  inputSchema?: Record<string, unknown>
  status: 'draft' | 'ready' | 'failed'
  /** User-controlled operating mode. Defaults to `active` when omitted. */
  mode?: KnowledgeManualMode
  updatedAt: string
}

/** A structured source inside a `kind: 'data'` base. */
export type KnowledgeDataSource = {
  id: string
  version?: number
  baseId: string
  name: string
  kind: 'table' | 'api' | 'database'
  /** Non-secret config only. Render as key/value chips. */
  config: Record<string, string>
  status: 'connected' | 'disconnected' | 'error'
  /** User-controlled operating mode. Defaults to `active` when omitted. */
  mode?: KnowledgeManualMode
  lastSyncedAt: string | null
}

/**
 * List row. Counts/status are projected from the shared mock/backend state,
 * so the list and detail screen cannot drift apart.
 */
export type KnowledgeBaseListItem = KnowledgeBase & {
  documentCount: number
  agentCount: number
  status: KnowledgeBaseStatus
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

/* ------------------------------------------------------------------ */
/* Shared status helpers                                               */
/* ------------------------------------------------------------------ */

export function normalizedKnowledgeMode(
  mode?: KnowledgeManualMode,
): KnowledgeManualMode {
  return mode ?? 'active'
}

/**
 * Manual cycle used by both Knowledge main page and Knowledge detail:
 * Ready(active) -> Paused -> Testing -> Ready(active).
 */
export function nextKnowledgeManualMode(
  current?: KnowledgeManualMode,
): KnowledgeManualMode {
  const mode = normalizedKnowledgeMode(current)
  return mode === 'active' ? 'paused' : mode === 'paused' ? 'testing' : 'active'
}

export function getDocumentDisplayStatus(
  document: Pick<KnowledgeDocument, 'status' | 'mode'>,
): KnowledgeItemDisplayStatus {
  if (document.status === 'stored_only') return 'stored_only'
  if (document.status === 'failed') return 'failed'
  if (document.status === 'processing') return 'processing'
  const mode = normalizedKnowledgeMode(document.mode)
  if (mode === 'testing') return 'testing'
  if (mode === 'paused') return 'paused'
  return 'ready'
}

export function getSkillDisplayStatus(
  skill: Pick<KnowledgeSkill, 'status' | 'mode'>,
): KnowledgeItemDisplayStatus {
  if (skill.status === 'failed') return 'failed'
  if (skill.status === 'draft') return 'processing'
  const mode = normalizedKnowledgeMode(skill.mode)
  if (mode === 'testing') return 'testing'
  if (mode === 'paused') return 'paused'
  return 'ready'
}

export function getDataSourceDisplayStatus(
  source: Pick<KnowledgeDataSource, 'status' | 'mode'>,
): KnowledgeItemDisplayStatus {
  if (source.status === 'error') return 'failed'
  if (source.status === 'disconnected') return 'processing'
  const mode = normalizedKnowledgeMode(source.mode)
  if (mode === 'testing') return 'testing'
  if (mode === 'paused') return 'paused'
  return 'ready'
}

function rollUpStatuses(
  statuses: KnowledgeItemDisplayStatus[],
): KnowledgeBaseStatus {
  if (statuses.length === 0) return 'empty'

  // System health always wins over user intent.
  if (statuses.some((status) => status === 'failed')) return 'failed'
  if (statuses.some((status) => status === 'processing')) return 'processing'
  if (statuses.some((status) => status === 'stored_only')) return 'stored_only'

  // Then expose the strongest manual state.
  if (statuses.some((status) => status === 'testing')) return 'testing'
  if (statuses.some((status) => status === 'paused')) return 'paused'

  return 'ready'
}

/**
 * Single base roll-up rule used by list/detail projections.
 * This is the source of truth for the Knowledge Base status badge.
 */
export function deriveBaseStatus(
  kind: KnowledgeBaseKind,
  content: {
    documents?: Array<Pick<KnowledgeDocument, 'status' | 'mode'>>
    skills?: Array<Pick<KnowledgeSkill, 'status' | 'mode'>>
    dataSources?: Array<Pick<KnowledgeDataSource, 'status' | 'mode'>>
  },
): KnowledgeBaseStatus {
  if (kind === 'skill') {
    return rollUpStatuses((content.skills ?? []).map(getSkillDisplayStatus))
  }

  if (kind === 'data') {
    return rollUpStatuses(
      (content.dataSources ?? []).map(getDataSourceDisplayStatus),
    )
  }

  return rollUpStatuses(
    (content.documents ?? []).map(getDocumentDisplayStatus),
  )
}

/** Only active/ready content may be used as assistant evidence. */
export function documentIsRetrievable(
  document: Pick<KnowledgeDocument, 'status' | 'mode'>,
): boolean {
  return (
    document.status === 'ready' &&
    normalizedKnowledgeMode(document.mode) === 'active'
  )
}
