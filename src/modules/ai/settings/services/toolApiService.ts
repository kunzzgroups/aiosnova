import { apiRequest, ApiError } from '@/services/httpClient'
import { fetchAgents } from '@/modules/ai/agents/services/agentService'
import {
  TOOL_MODULES,
  type AiTool,
  type ToolModule,
  type ToolRisk,
  type ToolStatus,
  type SaveToolPayload,
} from '../types/tools'

type StoredTool = {
  id: string
  companyId: string
  name: string
  description: string
  module: ToolModule
  action: string
  executorType: string
  risk: ToolRisk
  status: ToolStatus
  timeoutSeconds: number
  requiresConfirmation: boolean
  configuration: Record<string, unknown>
  version: number
  agentIds: string[]
}

function requireCompany(companyId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) {
    throw new Error('Select a valid company.')
  }
}

async function agentLabels(companyId: string) {
  const { items } = await fetchAgents(companyId)
  const labels = new Map<string, string>()
  const nameCounts = new Map<string, number>()

  for (const agent of items) {
    if (agent.companyId !== companyId) {
      throw new Error('Agent response does not match this company.')
    }

    nameCounts.set(
      agent.name,
      (nameCounts.get(agent.name) ?? 0) + 1,
    )
  }

  for (const agent of items) {
    // Distinguish Agents with identical names.
    labels.set(
      agent.id,
      (nameCounts.get(agent.name) ?? 0) > 1
        ? `${agent.name} · ${agent.id}`
        : agent.name,
    )
  }

  return labels
}

function toTool(
  row: StoredTool,
  companyId: string,
  labels: Map<string, string>,
): AiTool {
  if (
    row.companyId !== companyId ||
    !row.id ||
    !Array.isArray(row.agentIds) ||
    row.agentIds.some(id => typeof id !== 'string' || !id) ||
    new Set(row.agentIds).size !== row.agentIds.length ||
    !Number.isSafeInteger(row.version) ||
    row.version < 0 ||
    !TOOL_MODULES.includes(row.module) ||
    !['low', 'medium', 'high'].includes(row.risk) ||
    !['active', 'disabled', 'error'].includes(row.status) ||
    !row.configuration ||
    typeof row.configuration !== 'object' ||
    Array.isArray(row.configuration)
  ) {
    throw new Error('Invalid stored tool response.')
  }

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    module: row.module,
    action: row.action,
    executorType: row.executorType,
    risk: row.risk,
    status: row.status,
    timeoutSeconds: row.timeoutSeconds,
    requiresConfirmation: row.requiresConfirmation,
    configuration: structuredClone(row.configuration),
    version: row.version,
    agentIds: [...row.agentIds],
    agents: row.agentIds.map(
      id => labels.get(id) ?? `Unavailable Agent (${id})`,
    ),

    // These are not supplied by the current management API.
    activity: [],
    updatedAt: '',
  }
}

export async function fetchStoredTools(
  companyId: string,
): Promise<AiTool[]> {
  requireCompany(companyId)

  const query = new URLSearchParams({ companyId })

  const [result, labels] = await Promise.all([
    apiRequest<{ items: StoredTool[] }>(
      `/api/ai/tools?${query}`,
      { cache: 'no-store' },
    ),
    agentLabels(companyId),
  ])

  if (!Array.isArray(result.items)) {
    throw new Error('Invalid stored tool list.')
  }

  return result.items.map(row => toTool(row, companyId, labels))
}

export async function fetchStoredTool(
  companyId: string,
  toolId: string,
): Promise<AiTool> {
  requireCompany(companyId)

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(toolId)) {
    throw new Error('Invalid tool ID.')
  }

  const query = new URLSearchParams({ companyId })

  const [row, labels] = await Promise.all([
    apiRequest<StoredTool>(
      `/api/ai/tools/${encodeURIComponent(toolId)}?${query}`,
      { cache: 'no-store' },
    ),
    agentLabels(companyId),
  ])

  if (row.id !== toolId) {
    throw new Error('Tool response does not match the requested tool.')
  }

  return toTool(row, companyId, labels)
}

type SavedTool = {
  id: string
  version: number
  agentIds: string[]
}

function requireVersion(version: number | undefined): number {
  if (
    version === undefined ||
    !Number.isSafeInteger(version) ||
    version < 0
  ) {
    throw new ApiError('Reload this tool before saving.', 409)
  }
  return version
}

function requireToolScope(companyId: string, tool: AiTool) {
  requireCompany(companyId)

  if (tool.companyId !== companyId) {
    throw new ApiError('This tool belongs to another company.', 403)
  }

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tool.id)) {
    throw new Error('Invalid tool ID.')
  }
}

function requireAgentIds(ids: string[]): string[] {
  if (
    !Array.isArray(ids) ||
    ids.some(id =>
      typeof id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id)
    ) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error('Invalid Agent IDs.')
  }

  return [...ids]
}

async function writeAndRead(
  companyId: string,
  path: string,
  method: 'POST' | 'PUT' | 'PATCH',
  body: unknown,
  expectedId?: string,
): Promise<AiTool> {
  const saved = await apiRequest<SavedTool>(path, {
    method,
    body,
  })

  if (
    !saved.id ||
    (expectedId !== undefined && saved.id !== expectedId) ||
    !Number.isSafeInteger(saved.version) ||
    saved.version < 0
  ) {
    throw new Error(
      'The save response was invalid. Reload before trying again.',
    )
  }

  // The write endpoint returns IDs/version, not the complete detail.
  try {
    return await fetchStoredTool(companyId, saved.id)
  } catch {
    throw new Error(
      'The tool was saved, but reloading failed. Refresh the page before making another change.',
    )
  }
}

export async function saveStoredTool(
  companyId: string,
  payload: SaveToolPayload,
  original?: AiTool,
): Promise<AiTool> {
  requireCompany(companyId)

  let executorType: string
  let agentIds: string[]
  let version: number | undefined

  if (original) {
    requireToolScope(companyId, original)
    version = requireVersion(original.version)

    if (payload.action !== original.action) {
      throw new Error('The Action of an existing tool cannot be changed.')
    }

    if (!original.executorType || !original.agentIds) {
      throw new Error('Reload this tool before saving.')
    }

    executorType = original.executorType
    agentIds = requireAgentIds(original.agentIds)
  } else {
    // Calculator is the executor currently implemented and tested.
    if (payload.action !== 'calc.run') {
      throw new Error(
        'Only Calculator creation is supported by the current executor mapping.',
      )
    }

    executorType = 'calculator'
    agentIds = []
  }

  const body = {
    companyId,
    name: payload.name.trim(),
    description: payload.description,
    module: payload.module,
    action: payload.action,
    executorType,
    risk: payload.risk,
    status: payload.enabled ? 'active' : 'disabled',
    timeoutSeconds: payload.timeoutSeconds,
    requiresConfirmation: payload.requiresConfirmation,
    configuration: payload.configuration,
    agentIds,
    ...(original ? { version } : {}),
  }

  return writeAndRead(
    companyId,
    original
      ? `/api/ai/tools/${encodeURIComponent(original.id)}`
      : '/api/ai/tools',
    original ? 'PUT' : 'POST',
    body,
    original?.id,
  )
}

export async function setStoredToolEnabled(
  companyId: string,
  tool: AiTool,
  enabled: boolean,
): Promise<AiTool> {
  requireToolScope(companyId, tool)

  return writeAndRead(
    companyId,
    `/api/ai/tools/${encodeURIComponent(tool.id)}/enabled`,
    'PATCH',
    {
      companyId,
      enabled,
      version: requireVersion(tool.version),
    },
    tool.id,
  )
}

export async function saveStoredToolAgents(
  companyId: string,
  tool: AiTool,
  agentIds: string[],
): Promise<AiTool> {
  requireToolScope(companyId, tool)

  return writeAndRead(
    companyId,
    `/api/ai/tools/${encodeURIComponent(tool.id)}/agents`,
    'PUT',
    {
      companyId,
      version: requireVersion(tool.version),
      agentIds: requireAgentIds(agentIds),
    },
    tool.id,
  )
}