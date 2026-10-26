/** Stored Agent CRUD. All reads and writes go to Java; no Mock fallback. */
import { apiRequest, ApiError } from '@/services/httpClient'
import type { AgentDetail, AgentListItem, AgentModelConfig, AgentStatus } from '../types/agent'

type CreateAgentPayload = {
  name: string; description: string; companyId: string; category?: string
  status?: Extract<AgentStatus, 'active' | 'draft'>; knowledgeBaseIds: string[]; model?: AgentModelConfig
}
type UpdateAgentPayload = {
  companyId: string; version: number | undefined; name?: string; description?: string
  category?: string; status?: AgentStatus; knowledgeBaseIds?: string[]; model?: AgentModelConfig
}
export type AgentKnowledgeBase = { id: string; name: string; companyId: string; documentCount: number }

function expectedVersion(version: number | undefined) {
  if (!Number.isSafeInteger(version) || version === undefined || version < 0)
    throw new ApiError('Reload this Agent before saving or deleting it.', 409)
  return version
}
function normalize(agent: AgentListItem): AgentListItem {
  return {
    ...agent,
    createdAt: /(?:Z|[+-]\d\d:\d\d)$/.test(agent.createdAt) ? agent.createdAt : `${agent.createdAt}Z`,
    model: agent.model ? { ...agent.model, binding: agent.model.binding ?? undefined } : undefined,
  }
}
export async function fetchAgents(companyId: string): Promise<{ items: AgentListItem[] }> {
  const result = await apiRequest<{ items: AgentListItem[] }>(`/api/ai/agents?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
  return { items: result.items.map(normalize) }
}
export async function fetchAgent(agentId: string, companyId: string): Promise<AgentDetail> {
  const detail = await apiRequest<AgentDetail>(`/api/ai/agents/${encodeURIComponent(agentId)}?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
  return { ...detail, agent: normalize(detail.agent) }
}
export async function fetchAgentKnowledgeBases(companyId: string): Promise<{ items: AgentKnowledgeBase[] }> {
  return apiRequest(`/api/ai/agents/knowledge-bases?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
}
export async function createAgent(payload: CreateAgentPayload): Promise<AgentListItem> {
  return normalize(await apiRequest<AgentListItem>('/api/ai/agents', { method: 'POST', body: payload }))
}
export async function updateAgent(agentId: string, patch: UpdateAgentPayload): Promise<AgentListItem> {
  return normalize(await apiRequest<AgentListItem>(`/api/ai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH', body: { ...patch, version: expectedVersion(patch.version) },
  }))
}
export async function deleteAgent(agentId: string, companyId: string, version: number | undefined): Promise<void> {
  await apiRequest(`/api/ai/agents/${encodeURIComponent(agentId)}?companyId=${encodeURIComponent(companyId)}&version=${expectedVersion(version)}`, { method: 'DELETE' })
}

