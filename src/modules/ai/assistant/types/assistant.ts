export type SourceType = 'contract' | 'invoice' | 'policy' | 'record'

export type ThreadGroup = 'today' | 'yesterday' | 'earlier'

export type AssistantSource = {
  id: string
  type: SourceType
  title: string
  origin: string
  snippet: string
  relevance: number
  kind?: 'file' | 'record'
  baseId?: string
  documentId?: string
}

export type AssistantFact = {
  label: string
  value: string
}

export type AssistantTrace = {
  scanned: number
  matched: number
  seconds: number
  scope?: string
}

export type AssistantAnswer = {
  lead: string
  facts: AssistantFact[]
  tail: string
  model?: string
  cites: number[]
  trace: AssistantTrace
}

export type AssistantTurn = {
  id: string
  question: string
  kind: 'grounded' | 'chat'
  answer: AssistantAnswer
  sources: AssistantSource[]
}

export type AssistantThread = {
  id: string
  title: string
  group: ThreadGroup
  updatedAt: string
  companyId: string
  agentId: string
  pinned?: boolean
  turns: AssistantTurn[]
}
