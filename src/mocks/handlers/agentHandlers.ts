import { HttpResponse, http } from 'msw'
import { agents, agentKnowledgeLinks } from '@/mocks/data/agents'
import type { AgentListItem, AgentStatus } from '@/modules/ai/agents/types/agent'
import { DEMO_TENANT_ID } from '@/mocks/data/identity'

/**
 * Agent CRUD, plus the agent-side half of the agent <-> knowledge relation.
 *
 * `knowledgeBaseIds` in a create/update body writes `agentKnowledgeLinks` - the
 * same table the Knowledge screen writes through `/api/knowledge/...`. Neither
 * screen keeps its own copy, so they cannot drift.
 */

const AGENT_STATUSES: AgentStatus[] = ['active', 'draft', 'disabled']

function createId() {
  return `agent_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

/** Distinct bases, base-level only - overrides are a document concern. */
function knowledgeBaseCount(agentId: string): number {
  return new Set(
    agentKnowledgeLinks.filter((link) => link.agentId === agentId).map((link) => link.baseId),
  ).size
}

function toListItem(agentId: string): AgentListItem | null {
  const found = agents.find((item) => item.id === agentId)
  if (!found) {
    return null
  }
  return { ...found, knowledgeBaseCount: knowledgeBaseCount(agentId) }
}

/** Replace an agent's base-level ticks wholesale. */
function setAgentKnowledge(agentId: string, baseIds: string[]) {
  for (let index = agentKnowledgeLinks.length - 1; index >= 0; index -= 1) {
    if (agentKnowledgeLinks[index].agentId === agentId) {
      agentKnowledgeLinks.splice(index, 1)
    }
  }
  const assignedAt = new Date().toISOString()
  for (const baseId of baseIds) {
    agentKnowledgeLinks.push({ agentId, baseId, assignedAt })
  }
}

export const agentHandlers = [
  http.get('/api/agents', ({ request }) => {
    const companyId = new URL(request.url).searchParams.get('companyId')
    const items = agents
      .filter((item) => !companyId || item.companyId === companyId)
      .map((item) => toListItem(item.id))
      .filter((item): item is AgentListItem => item !== null)

    return HttpResponse.json({ items })
  }),

  http.get('/api/agents/:agentId', ({ params }) => {
    const agentId = String(params.agentId)
    const agent = toListItem(agentId)
    if (!agent) {
      return HttpResponse.json({ message: 'Agent not found.' }, { status: 404 })
    }
    return HttpResponse.json({
      agent,
      knowledgeBaseIds: agentKnowledgeLinks
        .filter((link) => link.agentId === agentId)
        .map((link) => link.baseId),
    })
  }),

  http.post('/api/agents', async ({ request }) => {
    const body = (await request.json()) as {
      name?: string
      description?: string
      companyId?: string
      knowledgeBaseIds?: string[]
    }

    const name = (body.name ?? '').trim()
    if (!name) {
      return HttpResponse.json({ message: 'Agent name is required.' }, { status: 422 })
    }

    const created = {
      id: createId(),
      tenantId: DEMO_TENANT_ID,
      companyId: body.companyId ?? '',
      name,
      description: (body.description ?? '').trim(),
      status: 'draft' as AgentStatus,
      createdAt: new Date().toISOString(),
    }
    agents.push(created)
    setAgentKnowledge(created.id, body.knowledgeBaseIds ?? [])

    return HttpResponse.json(toListItem(created.id), { status: 201 })
  }),

  http.patch('/api/agents/:agentId', async ({ params, request }) => {
    const agentId = String(params.agentId)
    const agent = agents.find((item) => item.id === agentId)
    if (!agent) {
      return HttpResponse.json({ message: 'Agent not found.' }, { status: 404 })
    }

    const body = (await request.json()) as {
      name?: string
      description?: string
      status?: string
      knowledgeBaseIds?: string[]
    }

    if (typeof body.name === 'string' && body.name.trim()) {
      agent.name = body.name.trim()
    }
    if (typeof body.description === 'string') {
      agent.description = body.description.trim()
    }
    if (body.status && AGENT_STATUSES.includes(body.status as AgentStatus)) {
      agent.status = body.status as AgentStatus
    }
    if (Array.isArray(body.knowledgeBaseIds)) {
      setAgentKnowledge(agentId, body.knowledgeBaseIds)
    }

    return HttpResponse.json(toListItem(agentId))
  }),
]
