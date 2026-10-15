/**
 * Agent service.
 *
 * Mock-backed for now. The important invariant is enforced here as well as in
 * the UI/mock relation helpers: only ACTIVE agents can hold effective
 * Knowledge Base assignments.
 */

import { DEMO_MERCHANT_ID } from '@/mocks/data/identity'
import { ApiError } from '@/services/httpClient'
import {
  getMockState,
  nextId,
  toAgentListItem,
} from '@/modules/ai/mock/mockStore'
import type {
  AgentDetail,
  AgentListItem,
  AgentModelConfig,
  AgentStatus,
} from '../types/agent'

const USE_MOCK = true

type CreateAgentPayload = {
  name: string
  description: string
  companyId: string
  category?: string
  status?: Extract<AgentStatus, 'active' | 'draft'>
  knowledgeBaseIds: string[]
  model?: AgentModelConfig
}

type UpdateAgentPayload = {
  name?: string
  description?: string
  category?: string
  status?: AgentStatus
  knowledgeBaseIds?: string[]
  model?: AgentModelConfig
}

function visibleAgents(companyId: string) {
  const state = getMockState()
  return state.agents.filter((agent) => agent.companyId === companyId)
}

function assignableBaseIds(
  companyId: string,
  requestedIds: string[],
): string[] {
  const state = getMockState()
  const requested = new Set(requestedIds)

  return state.bases
    .filter((base) => base.companyId === companyId)
    .filter((base) => requested.has(base.id))
    .map((base) => base.id)
}

function effectiveKnowledgeBaseIds(
  agent: { status: AgentStatus; companyId: string; knowledgeBaseIds: string[] },
): string[] {
  if (agent.status !== 'active') return []
  return assignableBaseIds(agent.companyId, agent.knowledgeBaseIds)
}

export async function fetchAgents(
  companyId: string,
): Promise<{ items: AgentListItem[] }> {
  if (USE_MOCK) {
    return {
      items: visibleAgents(companyId).map((agent) => ({
        ...toAgentListItem(agent),
        knowledgeBaseIds: effectiveKnowledgeBaseIds(agent),
        knowledgeBaseCount: effectiveKnowledgeBaseIds(agent).length,
      })),
    }
  }

  throw new ApiError('Agent API is not connected.', 501)
}

export async function fetchAgent(agentId: string): Promise<AgentDetail> {
  if (USE_MOCK) {
    const state = getMockState()
    const agent = state.agents.find((item) => item.id === agentId)

    if (!agent) {
      throw new ApiError(`Agent ${agentId} not found.`, 404)
    }

    const knowledgeBaseIds = effectiveKnowledgeBaseIds(agent)

    return {
      agent: {
        ...toAgentListItem(agent),
        knowledgeBaseIds,
        knowledgeBaseCount: knowledgeBaseIds.length,
      },
      knowledgeBaseIds,
    }
  }

  throw new ApiError('Agent API is not connected.', 501)
}

export async function createAgent(
  payload: CreateAgentPayload,
): Promise<AgentListItem> {
  if (USE_MOCK) {
    const state = getMockState()
    const now = new Date().toISOString()

    const initialStatus = payload.status ?? 'active'

    const agent = {
      id: nextId('agent'),
      merchantId: DEMO_MERCHANT_ID,
      companyId: payload.companyId,
      name: payload.name.trim(),
      description: payload.description,
      category: payload.category?.trim() || 'General',
      status: initialStatus,
      createdAt: now,
      knowledgeBaseIds:
        initialStatus === 'active'
          ? assignableBaseIds(payload.companyId, payload.knowledgeBaseIds)
          : [],
      model: payload.model
        ? { ...payload.model }
        : {
            provider: 'auto' as const,
            model: '',
            temperature: 0.3,
            topP: 1,
            maxTokens: 2048,
          },
    }

    state.agents.push(agent)

    return {
      ...toAgentListItem(agent),
      knowledgeBaseIds: [...agent.knowledgeBaseIds],
      knowledgeBaseCount: agent.knowledgeBaseIds.length,
    }
  }

  throw new ApiError('Agent API is not connected.', 501)
}

export async function updateAgent(
  agentId: string,
  patch: UpdateAgentPayload,
): Promise<AgentListItem> {
  if (USE_MOCK) {
    const state = getMockState()
    const agent = state.agents.find((item) => item.id === agentId)

    if (!agent) {
      throw new ApiError(`Agent ${agentId} not found.`, 404)
    }

    if (patch.name !== undefined) {
      agent.name = patch.name.trim() || agent.name
    }

    if (patch.description !== undefined) {
      agent.description = patch.description
    }

    if (patch.category !== undefined) {
      agent.category = patch.category
    }

    if (patch.model !== undefined) {
      agent.model = { ...patch.model }
    }

    const nextStatus = patch.status ?? agent.status
    agent.status = nextStatus

    /*
     * Assignment invariant:
     * - non-active agent => no Knowledge assignments
     * - active agent => only bases owned by the same company are accepted
     */
    if (nextStatus !== 'active') {
      agent.knowledgeBaseIds = []
    } else if (patch.knowledgeBaseIds !== undefined) {
      agent.knowledgeBaseIds = assignableBaseIds(
        agent.companyId,
        patch.knowledgeBaseIds,
      )
    } else {
      // Also clean up any stale IDs from older mock data.
      agent.knowledgeBaseIds = assignableBaseIds(
        agent.companyId,
        agent.knowledgeBaseIds,
      )
    }

    const knowledgeBaseIds = [...agent.knowledgeBaseIds]

    return {
      ...toAgentListItem(agent),
      knowledgeBaseIds,
      knowledgeBaseCount: knowledgeBaseIds.length,
    }
  }

  throw new ApiError('Agent API is not connected.', 501)
}

export async function deleteAgent(agentId: string): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const agent = state.agents.find((item) => item.id === agentId)

    if (!agent) return

    // Base-level assignments are projected from each Agent's knowledgeBaseIds,
    // so removing the Agent removes those relationships immediately.
    state.agents = state.agents.filter((item) => item.id !== agentId)

    // Remove the Agent from every explicit document override. Keep [] when the
    // deleted Agent was the last override entry so the document does not
    // unexpectedly fall back to base-level inheritance.
    for (const [documentId, assignedAgentIds] of state.documentOverrides) {
      if (!assignedAgentIds.includes(agentId)) continue

      state.documentOverrides.set(
        documentId,
        assignedAgentIds.filter((id) => id !== agentId),
      )
    }

    return
  }

  throw new ApiError('Agent API is not connected.', 501)
}

