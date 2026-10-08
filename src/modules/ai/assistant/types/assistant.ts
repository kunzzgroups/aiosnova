/**
 * Shapes the AI Assistant screen renders.
 *
 * Nothing here is populated yet: there is no assistant service, so the page
 * starts empty and shows its empty/no-service states. These types are the
 * contract a real `assistantService` should satisfy.
 */

export type SourceKind = 'file' | 'record'

/** Drives the badge colour, and whether opening it means file or record. */
export type SourceType = 'contract' | 'invoice' | 'policy' | 'record'

export type AssistantSource = {
  id: string
  type: SourceType
  kind: SourceKind
  title: string
  /** Where it lives: file path + page/section, or the record's table + company. */
  origin: string
  snippet: string
  /** 0-100, rendered as the small bar on the right of the row. */
  relevance: number
  /** Where this evidence came from - used to build the "open" link. */
  baseId?: string
  documentId?: string
}

export type AssistantAnswer = {
  lead: string
  facts: Array<{ label: string; value: string }>
  tail: string
  /** 1-based indexes into `sources`, rendered as the inline citation chips. */
  cites: number[]
  /** Model that produced the answer, when the service reports one. */
  model?: string
  trace: {
    scanned: number
    matched: number
    seconds: number
    /** Scope label used for the search, when it was not "everything". */
    scope?: string
  }
}

/**
 * Which kind of reply this turn is.
 *
 * - `'chat'`     - a plain conversational reply, no sources by design.
 * - `'grounded'` - a search-backed answer; an empty `sources` array means the
 *                  search ran and matched nothing (the no-match state).
 *
 * Older persisted turns without this field are treated as `'chat'` by the page.
 */
export type TurnKind = 'chat' | 'grounded'

export type AssistantTurn = {
  id: string
  question: string
  /** Defaults to `'chat'` when missing on turns loaded from storage. */
  kind?: TurnKind
  answer: AssistantAnswer
  /** Empty means the search matched nothing - rendered as the no-match state. */
  sources: AssistantSource[]
}

export type ThreadGroup = 'today' | 'yesterday' | 'earlier'

export type AssistantThread = {
  id: string
  title: string
  group: ThreadGroup
  updated: string
  pinned?: boolean
  companyId: string
  /** Which agent this thread last used. Falls back to Auto when absent. */
  agentId?: string
  turns: AssistantTurn[]
}
