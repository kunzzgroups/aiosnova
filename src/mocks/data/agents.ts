import type { AiAgent } from '@/modules/ai/agents/types/agent'
import type { AgentDocumentLink, AgentKnowledgeLink } from '@/modules/ai/shared/assignment'
import { DEMO_TENANT_ID } from '@/mocks/data/identity'

/**
 * Agents plus the two relation tables that bind them to knowledge.
 *
 * All three are mutable: the screens write through MSW handlers, so ticking a box
 * on the Agent screen changes what the Knowledge screen shows (and the reverse)
 * for the rest of the session. Nothing is persisted - a reload restores this seed.
 */

function agent(
  id: string,
  companyId: string,
  name: string,
  description: string,
  status: AiAgent['status'],
  createdAt: string,
): AiAgent {
  return { id, tenantId: DEMO_TENANT_ID, companyId, name, description, status, createdAt }
}

export const agents: AiAgent[] = [
  // ── Acme Retail ────────────────────────────────────────────────
  agent('agent-hr', 'company-retail', 'HR Agent', 'Answers people-policy questions from HR material.', 'active', '2026-02-20T09:00:00.000Z'),
  agent('agent-finance', 'company-retail', 'Finance Agent', 'Answers accounting and tax questions.', 'active', '2026-02-20T09:10:00.000Z'),
  agent('agent-support', 'company-retail', 'Support Agent', 'Front-line customer support replies.', 'active', '2026-02-21T09:00:00.000Z'),
  agent('agent-sales', 'company-retail', 'Sales Agent', 'Drafts quotes and answers pricing questions.', 'active', '2026-02-21T09:20:00.000Z'),
  agent('agent-onboarding', 'company-retail', 'Onboarding Agent', 'Walks new hires through company and HR policy.', 'draft', '2026-02-22T09:00:00.000Z'),
  agent('agent-policy', 'company-retail', 'Policy Agent', 'Compliance and policy lookups.', 'active', '2026-02-22T10:00:00.000Z'),

  // ── Acme Wholesale ─────────────────────────────────────────────
  agent('agent-ws-supplier', 'company-wholesale', 'Supplier Agent', 'Answers supplier contract and pricing questions.', 'active', '2026-03-02T09:00:00.000Z'),

  // ── J1 (MIDVALLEY) ─────────────────────────────────────────────
  agent('agent-j1-floor', 'company-j1', 'Floor Agent', 'Outlet floor questions.', 'active', '2026-03-05T09:00:00.000Z'),

  // ── J2 (PARADIGM MALL) ─────────────────────────────────────────
  agent('agent-j2-floor', 'company-j2', 'Floor Supervisor Agent', 'Shift, equipment and incident questions.', 'active', '2026-03-11T09:00:00.000Z'),
  agent('agent-j2-kitchen', 'company-j2', 'Kitchen Agent', 'Recipes, portioning and allergens.', 'active', '2026-03-11T09:10:00.000Z'),
  agent('agent-j2-campaign', 'company-j2', 'Campaign Agent', 'Mall campaign and promotion rules.', 'active', '2026-03-11T09:20:00.000Z'),
  agent('agent-j2-hr', 'company-j2', 'Outlet HR Agent', 'Outlet staff policy questions.', 'draft', '2026-03-11T09:30:00.000Z'),

  // ── TOKYO IZAKAYA SDN BHD ──────────────────────────────────────
  agent('agent-tokyo-kitchen', 'company-tokyo-izakaya', 'Kitchen Agent', 'Kitchen runbook and menu questions.', 'active', '2026-03-14T09:00:00.000Z'),
]

const SEEDED_AT = '2026-03-15T09:00:00.000Z'

/** Base-level default: one row per (agent, base) pair. */
function baseLinks(baseId: string, agentIds: string[]): AgentKnowledgeLink[] {
  return agentIds.map((agentId) => ({ agentId, baseId, assignedAt: SEEDED_AT }))
}

/** Document-level override: one row per (agent, document) pair. */
function documentLinks(documentId: string, agentIds: string[]): AgentDocumentLink[] {
  return agentIds.map((agentId) => ({ agentId, documentId, assignedAt: SEEDED_AT }))
}

export const agentKnowledgeLinks: AgentKnowledgeLink[] = [
  ...baseLinks('kb-retail-company', ['agent-hr', 'agent-finance', 'agent-support', 'agent-sales', 'agent-onboarding', 'agent-policy']),
  ...baseLinks('kb-retail-hr', ['agent-hr', 'agent-onboarding']),
  ...baseLinks('kb-retail-finance', ['agent-finance', 'agent-sales', 'agent-policy']),

  ...baseLinks('kb-wholesale-supplier', ['agent-ws-supplier']),

  ...baseLinks('kb-j1-outlet', ['agent-j1-floor']),
  ...baseLinks('kb-j1-menu', ['agent-j1-floor']),

  ...baseLinks('kb-j2-outlet', ['agent-j2-floor', 'agent-j2-kitchen', 'agent-j2-campaign', 'agent-j2-hr']),
  ...baseLinks('kb-j2-menu', ['agent-j2-kitchen', 'agent-j2-floor', 'agent-j2-campaign']),
  ...baseLinks('kb-j2-promotions', ['agent-j2-campaign', 'agent-j2-floor']),
  ...baseLinks('kb-j2-hr', ['agent-j2-hr']),

  ...baseLinks('kb-tokyo-outlet', ['agent-tokyo-kitchen']),
  ...baseLinks('kb-tokyo-menu', ['agent-tokyo-kitchen']),
]

/**
 * A few overrides so both directions are visible in the UI: narrowing a document
 * down to one agent, and widening one beyond what its base shares.
 */
export const agentDocumentLinks: AgentDocumentLink[] = [
  // Narrowed: the base reaches 6 agents, this failed document only one.
  ...documentLinks('doc-104', ['agent-policy']),
  // Narrowed: incident-adjacent record kept to the supervisor only.
  ...documentLinks('doc-405', ['agent-j2-floor']),
  // Narrowed: recipe card stays with the kitchen.
  ...documentLinks('doc-411', ['agent-j2-kitchen']),
  // Widened: outlet HR policy additionally shared with the floor supervisor.
  ...documentLinks('doc-432', ['agent-j2-hr', 'agent-j2-floor']),
]
