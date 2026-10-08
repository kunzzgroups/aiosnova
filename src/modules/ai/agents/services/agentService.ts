import { apiRequest } from '@/services/httpClient'
import type {
  AgentDetail,
  AgentListItem,
  AgentModelConfig,
  AgentStatus,
} from '@/modules/ai/agents/types/agent'
import { getMockState, nextId, toAgentListItem } from '@/modules/ai/mock/mockStore'

/**
 * Flip to false to hit the real backend. Kept as a module-level constant so a
 * single grep finds every mock branch.
 */
const USE_MOCK = true

/**
 * Agents the ACTIVE company can see.
 *
 * Strict rule: only agents owned by the active company. No fallback - a
 * company with no agents gets an empty list, which is what the UI expects.
 */
function visibleAgents(companyId: string) {
  if (!companyId) return []
  return getMockState().agents.filter((agent) => agent.companyId === companyId)
}

export async function fetchAgents(
  companyId: string,
): Promise<{ items: AgentListItem[] }> {
  if (USE_MOCK) {
    return { items: visibleAgents(companyId).map(toAgentListItem) }
  }

  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<{ items: AgentListItem[] }>(`/api/agents${query}`, {
    auth: true,
  })
}

export async function fetchAgent(agentId: string): Promise<AgentDetail> {
  if (USE_MOCK) {
    const agent = getMockState().agents.find((a) => a.id === agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }
    return {
      agent: toAgentListItem(agent),
      knowledgeBaseIds: [...agent.knowledgeBaseIds],
    }
  }

  return apiRequest<AgentDetail>(`/api/agents/${agentId}`, { auth: true })
}

export async function createAgent(payload: {
  name: string
  description: string
  companyId: string
  knowledgeBaseIds: string[]
  model?: AgentModelConfig
}): Promise<AgentListItem> {
  if (USE_MOCK) {
    const state = getMockState()
    const now = new Date().toISOString()
    const agent = {
      id: nextId('ag'),
      tenantId: 'tenant-demo',
      companyId: payload.companyId || 'company-demo',
      name: payload.name,
      description: payload.description,
      category: 'Other',
      status: 'active' as AgentStatus,
      createdAt: now,
      knowledgeBaseIds: [...payload.knowledgeBaseIds],
      model: payload.model ?? {
        provider: 'auto' as const,
        model: '',
        temperature: 0.3,
        topP: 1,
        maxTokens: 2048,
      },
    }
    state.agents.push(agent)
    return toAgentListItem(agent)
  }

  return apiRequest<AgentListItem>('/api/agents', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateAgent(
  agentId: string,
  payload: {
    name?: string
    description?: string
    status?: AgentStatus
    knowledgeBaseIds?: string[]
    model?: AgentModelConfig
  },
): Promise<AgentListItem> {
  if (USE_MOCK) {
    const agent = getMockState().agents.find((a) => a.id === agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (payload.name !== undefined) {
      agent.name = payload.name
    }
    if (payload.description !== undefined) {
      agent.description = payload.description
    }
    if (payload.status !== undefined) {
      agent.status = payload.status
    }
    if (payload.knowledgeBaseIds !== undefined) {
      agent.knowledgeBaseIds = [...payload.knowledgeBaseIds]
    }
    if (payload.model !== undefined) {
      agent.model = { ...payload.model }
    }

    return toAgentListItem(agent)
  }

  return apiRequest<AgentListItem>(`/api/agents/${agentId}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}
