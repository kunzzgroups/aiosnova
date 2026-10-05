import { apiRequest } from '@/services/httpClient'
import type { AgentDetail, AgentListItem, AgentStatus } from '@/modules/ai/agents/types/agent'

export async function fetchAgents(companyId: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<{ items: AgentListItem[] }>(`/api/agents${query}`, { auth: true })
}

export async function fetchAgent(agentId: string) {
  return apiRequest<AgentDetail>(`/api/agents/${agentId}`, { auth: true })
}

export async function createAgent(payload: {
  name: string
  description: string
  companyId: string
  knowledgeBaseIds: string[]
}) {
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
  },
) {
  return apiRequest<AgentListItem>(`/api/agents/${agentId}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}
