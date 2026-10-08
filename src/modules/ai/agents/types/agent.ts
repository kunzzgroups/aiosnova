/**
 * Shapes the AI Agents screen renders.
 *
 * An agent is what actually queries a knowledge base at runtime, so it is the
 * anchor of the agent <-> knowledge relation (`shared/assignment.ts`). It belongs
 * to one company, exactly like a knowledge base does, so a company only ever
 * exposes its own agents.
 */

export type AgentStatus = 'active' | 'draft' | 'disabled'

export type AgentModelProvider = 'auto' | 'openai' | 'anthropic' | 'google' | 'azure'

/**
 * Per-agent LLM configuration. `provider: 'auto'` means the router picks the
 * best model for the agent's knowledge; `model` is then empty.
 */
export type AgentModelConfig = {
  provider: AgentModelProvider
  model: string
  temperature: number
  topP: number
  maxTokens: number
}

export const DEFAULT_AGENT_MODEL: AgentModelConfig = {
  provider: 'auto',
  model: '',
  temperature: 0.3,
  topP: 1,
  maxTokens: 2048,
}

export type AiAgent = {
  id: string
  tenantId: string
  companyId: string
  name: string
  description: string
  /** Free-form group, e.g. "HR". Optional so existing data still type-checks. */
  category?: string
  status: AgentStatus
  createdAt: string
  /** Optional so existing rows still type-check; service applies the default. */
  model?: AgentModelConfig
}

/** List row. `knowledgeBaseCount` is the base-level default, not the override union. */
export type AgentListItem = AiAgent & {
  knowledgeBaseCount: number
  /**
   * Base-level default IDs. Optional so the list endpoint can omit them; the
   * `?baseId=` deep link on AgentsPage reads this to filter client-side.
   */
  knowledgeBaseIds?: string[]
}

export type AgentDetail = {
  agent: AgentListItem
  /** Base-level default: knowledge bases this agent is ticked for. */
  knowledgeBaseIds: string[]
}
