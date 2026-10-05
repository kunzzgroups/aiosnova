/**
 * Shapes the AI Agents screen renders.
 *
 * An agent is what actually queries a knowledge base at runtime, so it is the
 * anchor of the agent <-> knowledge relation (`shared/assignment.ts`). It belongs
 * to one company, exactly like a knowledge base does, so a company only ever
 * exposes its own agents.
 */

export type AgentStatus = 'active' | 'draft' | 'disabled'

export type AiAgent = {
  id: string
  tenantId: string
  companyId: string
  name: string
  description: string
  status: AgentStatus
  createdAt: string
}

/** List row. `knowledgeBaseCount` is the base-level default, not the override union. */
export type AgentListItem = AiAgent & {
  knowledgeBaseCount: number
}

export type AgentDetail = {
  agent: AgentListItem
  /** Base-level default: knowledge bases this agent is ticked for. */
  knowledgeBaseIds: string[]
}
