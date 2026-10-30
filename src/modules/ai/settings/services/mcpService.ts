import { companyFixture, fixtureTime } from './companyFixtures'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import type { MockConnectionOutcome } from '../types/connection'

export type McpServer = {
  id: string; companyId: string; name: string; url: string; auth: 'OAuth' | 'API Key' | 'None'; status: 'connected' | 'error' | 'disabled' | 'not_verified'
  description: string; clientId: string; secret: string; latency: number | null; errors: number; checkedAt: string | null; connectedAt: string | null
  capabilities: { name: string; enabled: boolean }[]; agents: string[]; models: string[]; permissions: string[]
  activity: { id: string; time: string; message: string; status?: 'success' | 'error' | 'neutral' }[]
  lastCheck?: { time: string; message: string; outcome?: MockConnectionOutcome }
  dataSource?: 'database'
  version?: number
  connectionRevision?: number
  verificationStatus?: 'not_verified' | 'verified' | 'failed'
}
export type McpPayload = Pick<McpServer, 'name' | 'url' | 'auth' | 'description' | 'clientId' | 'secret'> & { enabled: boolean }
// Local demo service, consistent with Tools. No network connections are made.
const store = new Map<string, McpServer[]>()
function records(companyId: string) {
  if (!companyId) throw new Error('Select a company to manage MCP servers.')
  if (!store.has(companyId)) {
    const fixture = companyFixture(companyId)
    const now = fixtureTime(90)
    const caps = ['repository.search', 'repository.read', 'issues.read', 'issues.create', 'pull_requests.read', 'pull_requests.create', 'branches.list', 'commits.read', 'actions.list', 'releases.read', 'labels.list', 'comments.create']
    const seeds = [
      { name: 'GitHub MCP', auth: 'OAuth', status: 'connected', url: 'https://api.github.com/mcp', description: 'GitHub repository and issue access', capabilities: caps, agents: ['Research Agent', 'Support Agent'], models: ['GPT-5', 'Claude Sonnet'], permissions: ['repo.read', 'issues.read'] },
      { name: 'Notion MCP', auth: 'OAuth', status: 'connected', url: 'https://mcp.notion.com/mcp', description: 'Workspace pages and knowledge access', capabilities: ['pages.search', 'pages.read', 'pages.create', 'blocks.read', 'blocks.append', 'databases.query', 'users.list'], agents: ['Research Agent'], models: [], permissions: ['pages.read', 'search'] },
      { name: 'Internal MCP', auth: 'API Key', status: 'error', url: 'https://internal.example.com/mcp', description: 'Internal business data and reporting', capabilities: ['reports.read', 'customers.search', 'orders.read', 'inventory.read', 'metrics.query'], agents: [], models: [], permissions: ['reports.read'] },
      { name: 'Local MCP', auth: 'None', status: 'disabled', url: 'http://localhost:3001/mcp', description: 'Local development connection', capabilities: ['files.list', 'files.read', 'files.search'], agents: [], models: [], permissions: ['files.read'] },
    ]
    store.set(companyId, fixture.mcp.map(config => {
      const base = seeds[config.index]
      const agents = companyId === 'company-j1'
        ? base.agents.map(name => name === 'Research Agent' ? 'IT Agent' : name === 'Support Agent' ? 'Customer Agent' : name)
        : companyId === 'company-j2' ? ['J2 Menu Agent'] : []
      return {
        ...base, id: 'mcp-' + config.index + '-' + companyId, companyId, name: config.name,
        auth: base.auth as McpServer['auth'], status: config.status, agents,
        models: companyId === 'company-j1' ? base.models : [],
        clientId: '', secret: '', latency: config.status === 'connected' ? fixture.security.steps * 6 + config.index * 19 : null,
        errors: config.status === 'error' ? 3 : 0, checkedAt: config.status === 'disabled' ? null : now,
        connectedAt: config.status === 'connected' ? now : null,
        capabilities: base.capabilities.map((name, index) => ({ name, enabled: index !== 3 })),
        activity: [{ id: companyId + '-mcp-' + config.index + '-initial', time: now, message: fixture.label + ' sample connection configuration registered.' }],
      }
    }))
  }
  return store.get(companyId)!
}
function find(companyId: string, id: string) { const item = records(companyId).find(s => s.id === id); if (!item) throw new Error('MCP server not found in this company.'); return item }
function log(server: McpServer, message: string, status: 'success' | 'error' | 'neutral' = 'neutral', time = new Date().toISOString()) { server.activity.unshift({ id: crypto.randomUUID(), time, message, status }) }
export async function fetchMcpServers(companyId: string) { return structuredClone(records(companyId)) }
export async function saveMcpServer(companyId: string, payload: McpPayload, id?: string) {
  if (!payload.name.trim()) throw new Error('Server name is required.')
  let url: URL; try { url = new URL(payload.url) } catch { throw new Error('Enter a valid server URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS server URL.')
  if (!['OAuth', 'API Key', 'None'].includes(payload.auth)) throw new Error('Choose a valid authentication method.')
  const previous = id ? find(companyId, id) : undefined
  const clientId = payload.auth === 'OAuth' ? payload.clientId : ''
  const secret = payload.auth === 'None' ? '' : payload.secret
  const changed = !previous || previous.url !== url.href || previous.auth !== payload.auth || previous.clientId !== clientId || previous.secret !== secret
  const reset = changed || !payload.enabled || previous?.status === 'disabled'
  const item: McpServer = { id: previous?.id ?? crypto.randomUUID(), companyId, name: payload.name.trim(), url: url.href, auth: payload.auth, description: payload.description, clientId: payload.auth === 'OAuth' ? payload.clientId : '', secret: payload.auth === 'None' ? '' : payload.secret, status: payload.enabled ? changed || previous?.status === 'disabled' ? 'not_verified' : previous?.status ?? 'not_verified' : 'disabled', latency: reset ? null : previous?.latency ?? null, errors: reset ? 0 : previous?.errors ?? 0, checkedAt: reset ? null : previous?.checkedAt ?? null, connectedAt: reset ? null : previous?.connectedAt ?? null, capabilities: previous?.capabilities ?? [], agents: previous?.agents ?? [], models: previous?.models ?? [], permissions: previous?.permissions ?? [], activity: previous?.activity ?? [] }
  log(item, previous ? changed ? 'Connection configuration updated. Not verified.' : 'Connection configuration updated.' : 'Connection configuration saved. Not verified.')
  if (!reset && previous?.lastCheck) item.lastCheck = structuredClone(previous.lastCheck)
  if (previous) store.set(companyId, records(companyId).map(s => s.id === id ? item : s)); else records(companyId).push(item)
  return structuredClone(item)
}
export async function toggleMcpServer(companyId: string, id: string) { const s = find(companyId, id); s.status = s.status === 'disabled' ? 'not_verified' : 'disabled'; s.latency = null; s.errors = 0; s.checkedAt = null; s.connectedAt = null; delete s.lastCheck; log(s, s.status === 'disabled' ? 'Connection disabled.' : 'Connection enabled. Not verified; simulated checks do not establish live health.'); return structuredClone(s) }
export async function testMcpServer(companyId: string, id: string, outcome: MockConnectionOutcome = 'validate') {
  const s = find(companyId, id)
  if (s.status === 'disabled') throw new Error('Enable this connection before testing.')
  if (!['validate', 'success', 'failure'].includes(outcome)) throw new Error('Choose a valid mock result.')
  s.checkedAt = new Date().toISOString()
  const message = outcome === 'success' ? 'Mock connection success. Connected is a demo result; no live request was made.' : outcome === 'failure' ? 'Mock connection failure. Error is a demo result; no live request was made.' : 'Simulated check recorded. No network request was made; connection health and authentication were not verified.'
  s.lastCheck = { time: s.checkedAt, message, outcome }
  if (outcome === 'success') { s.status = 'connected'; s.latency = 100; s.errors = 0; s.connectedAt = s.checkedAt }
  if (outcome === 'failure') { s.status = 'error'; s.latency = null; s.errors += 1; s.connectedAt = null }
  log(s, message, outcome === 'success' ? 'success' : outcome === 'failure' ? 'error' : 'neutral', s.checkedAt)
  return structuredClone(s)
}
export async function refreshMcpCapabilities(companyId: string, id: string) { const s = find(companyId, id); if (s.status === 'disabled') throw new Error('Enable this connection before refreshing.'); log(s, 'Demo capability list refreshed from local configuration.'); return structuredClone(s) }
export async function removeMcpServers(companyId: string, ids: string[]) { const unique = new Set(ids), items = records(companyId).filter(s => unique.has(s.id)); if (!unique.size || items.length !== unique.size) throw new Error('The selection has changed. Refresh and try again.'); if (items.some(s => s.status !== 'disabled')) throw new Error('Only disabled connections can be removed.'); store.set(companyId, records(companyId).filter(s => !unique.has(s.id))) }
export async function saveMcpAccess(companyId: string, id: string, names: string[]) { const s = find(companyId, id); const { items } = await fetchAgents(companyId); if (find(companyId, id) !== s) throw new Error('Connection configuration changed. Reopen Manage agents and try again.'); const allowed = new Set([...items.map(a => a.name), ...s.agents]); if (names.some(n => !allowed.has(n))) throw new Error('The agent list has changed. Reopen Manage access.'); s.agents = [...new Set(names)]; log(s, 'Agent access updated.'); return structuredClone(s) }
