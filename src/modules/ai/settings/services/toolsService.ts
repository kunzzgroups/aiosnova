import { mockToolConfiguration, validateToolConfiguration } from './toolConfiguration'
import { generateUsageRecords, usageDaily } from './usageService'
import { companyFixture, fixtureTime } from './companyFixtures'
import { TOOL_MODULES, type AiTool, type SaveToolPayload, type ToolRisk } from '../types/tools'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'

// Local mock data, matching the existing Phase 1 settings services. No tool executes here.
const store = new Map<string, AiTool[]>()
const seeds: Array<[string, string, AiTool['module'], ToolRisk, AiTool['status'], string[]]> = [
  ['Web Search', 'web.search', 'Retrieval', 'low', 'active', ['Research Agent', 'Support Agent']],
  ['Calculator', 'calc.run', 'Utility', 'low', 'active', ['Research Agent']],
  ['SQL Query', 'sql.query', 'Data', 'high', 'disabled', []],
  ['Send Email', 'email.send', 'Communication', 'high', 'disabled', []],
  ['File Read', 'file.read', 'Files', 'low', 'active', ['Support Agent']],
  ['Knowledge Search', 'knowledge.search', 'Retrieval', 'low', 'active', ['Research Agent']],
  ['HTTP Request', 'http.request', 'Utility', 'medium', 'error', []],
  ['CSV Export', 'csv.export', 'Data', 'medium', 'disabled', []],
  ['Document Extract', 'document.extract', 'Files', 'low', 'active', []],
  ['Translate', 'text.translate', 'Utility', 'low', 'active', []],
  ['Calendar Read', 'calendar.read', 'Communication', 'medium', 'active', []],
  ['File Write', 'file.write', 'Files', 'high', 'disabled', []],
]
const clone = (tool: AiTool): AiTool => structuredClone(tool)
function records(companyId: string) {
  if (!companyId) throw new Error('Select a company to manage tools.')
  if (!store.has(companyId)) {
    const fixture=companyFixture(companyId)
    const history=generateUsageRecords(companyId)
    const selected=fixture.tools.map(item=>{
      const seed=seeds.find(seed=>seed[1]===item.action)!
      return [item.name??seed[0],item.action,seed[2],seed[3],item.status,companyId==='company-j1'?seed[5].map(name=>name==='Research Agent'?'IT Agent':name==='Support Agent'?'Customer Agent':name):companyId==='company-j2'&&item.status==='active'?['J2 Menu Agent']:[]] as typeof seed
    })
    store.set(companyId, selected.map(([name, action, module, risk, status, agents], index) => ({
      id: 'tool-' + (index + 1)+'-'+companyId, companyId, name, action, module, risk, status, agents,
      description: 'Provides ' + name.toLowerCase() + ' capabilities to assigned agents.',
      timeoutSeconds: fixture.security.timeout, requiresConfirmation: risk === 'high', configuration: mockToolConfiguration(companyId,action),
      usage: {sample:true,points:usageDaily(history.filter(record=>record.toolId==='tool-'+(index+1)+'-'+companyId)).map((point,day)=>({date:point.date,requests:point.requests,errors:point.errors,latencyMs:90+index*27+(day*13)%110}))},
      updatedAt: fixtureTime(60+index*11),
      activity: [{ id: companyId+'-initial-'+index, time: fixtureTime(60+index*11), message: status === 'error' ? 'Sample error scenario. Review the tool configuration; no live execution was attempted.' : 'Tool configuration registered.', status: status === 'error' ? 'error' : 'info' }],
    })))
  }
  return store.get(companyId)!
}
function find(companyId: string, id: string) {
  const tool = records(companyId).find(item => item.id === id)
  if (!tool) throw new Error('Tool not found in this company.')
  return tool
}
function activity(tool: AiTool, message: string) {
  tool.updatedAt = new Date().toISOString()
  tool.activity.unshift({ id: crypto.randomUUID(), time: tool.updatedAt, message, status: 'info' })
}
function validate(payload: SaveToolPayload) {
  if (!payload.name.trim()) throw new Error('Tool name is required.')
  if (!TOOL_MODULES.includes(payload.module)) throw new Error('Choose a valid module.')
  if (!['low', 'medium', 'high'].includes(payload.risk)) throw new Error('Choose a valid risk level.')
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(payload.action.trim())) throw new Error('Use an action such as web.search or file.read.')
  if (!Number.isInteger(payload.timeoutSeconds) || payload.timeoutSeconds < 1 || payload.timeoutSeconds > 600) throw new Error('Timeout must be a whole number between 1 and 600 seconds.')
  if (!payload.configuration || typeof payload.configuration !== 'object' || Array.isArray(payload.configuration)) throw new Error('Configuration must be a JSON object.')
  const configurationErrors=validateToolConfiguration(payload.action,payload.configuration)
  if(Object.keys(configurationErrors).length)throw new Error(Object.values(configurationErrors)[0])
  if (payload.risk === 'high' && !payload.requiresConfirmation) throw new Error('High-risk tools must require confirmation.')
}
export async function fetchTools(companyId: string) { return records(companyId).map(clone) }
export async function fetchTool(companyId: string, id: string) { return clone(find(companyId, id)) }
export async function saveToolAgents(companyId: string, id: string, names: string[]) {
  const tool = find(companyId, id)
  const { items } = await fetchAgents(companyId)
  if(find(companyId,id)!==tool)throw new Error('Tool configuration changed. Reopen Manage agents and try again.')
  const allowed = new Set([...items.map(agent => agent.name), ...tool.agents])
  const selected = [...new Set(names)]
  if (selected.some(name => !allowed.has(name))) throw new Error('The agent list has changed. Reopen Manage agents and try again.')
  tool.agents = selected
  activity(tool, 'Agent assignments updated.')
  return clone(tool)
}
export async function saveTool(companyId: string, payload: SaveToolPayload, id?: string) {
  validate(payload)
  const previous = id ? find(companyId, id) : undefined
  const actionChanged = !!previous && previous.action !== payload.action.trim()
  const changedAt = new Date().toISOString()
  const tool: AiTool = {
    id: previous?.id ?? crypto.randomUUID(), companyId,
    name: payload.name.trim(), description: payload.description.trim(), module: payload.module,
    action: payload.action.trim(), risk: payload.risk, timeoutSeconds: payload.timeoutSeconds,
    requiresConfirmation: payload.requiresConfirmation, configuration: structuredClone(payload.configuration),
    status: payload.enabled ? previous?.status === 'error' ? 'error' : 'active' : 'disabled',
    agents: previous?.agents ?? [], activity: previous?.activity ?? [], usage: actionChanged ? undefined : previous?.usage, updatedAt: changedAt,
    previousActions: actionChanged && previous ? [...(previous.previousActions ?? []), structuredClone({ action: previous.action, name: previous.name, changedAt, configuration: previous.configuration, usage: previous.usage })] : previous?.previousActions,
  }
  activity(tool, actionChanged ? `Tool action changed from ${previous!.action} to ${tool.action}. Previous configuration and usage archived. Agent assignments retained; review access for the new capability.` : previous ? 'Tool configuration updated.' : 'Tool created.')
  if (previous) store.set(companyId, records(companyId).map(item => item.id === id ? tool : item))
  else records(companyId).push(tool)
  return clone(tool)
}
export async function setToolEnabled(companyId: string, id: string, enabled: boolean) {
  const tool = find(companyId, id)
  tool.status = enabled ? tool.status === 'error' ? 'error' : 'active' : 'disabled'
  activity(tool, enabled ? 'Tool enabled.' : 'Tool disabled. Assigned agents can no longer call this tool.')
  return clone(tool)
}
export async function deleteTool(companyId: string, id: string) {
  const tool = find(companyId, id)
  if (tool.status !== 'disabled') throw new Error('Disable this tool before deleting it.')
  if (tool.agents.length) throw new Error('Remove this tool from assigned agents before deleting it.')
  store.set(companyId, records(companyId).filter(item => item.id !== id))
}

export async function deleteTools(companyId: string, ids: string[]) {
  const unique = new Set(ids)
  if (!unique.size) throw new Error('Select disabled tools to remove.')
  const selected = records(companyId).filter(tool => unique.has(tool.id))
  if (selected.length !== unique.size) throw new Error('The selection has changed. Refresh and try again.')
  if (selected.some(tool => tool.status !== 'disabled')) throw new Error('Only disabled tools can be removed.')
  if (selected.some(tool => tool.agents.length > 0)) throw new Error('Remove agent assignments before deleting the selected tools.')
  store.set(companyId, records(companyId).filter(tool => !unique.has(tool.id)))
}
