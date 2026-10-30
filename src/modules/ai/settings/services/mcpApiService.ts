import { apiRequest } from '@/services/httpClient'
import type { McpServer } from './mcpService'

export const MCP_READ_ONLY = true

type StoredServer = {
  id: string
  companyId: string
  merchantId: string
  name: string
  description: string
  endpointUrl: string
  transport: string
  protocolVersion: string
  authType: 'none' | 'api_key'
  enabled: boolean
  timeoutSeconds: number
  connectionRevision: number
  verificationStatus: 'not_verified' | 'verified' | 'failed'
  verificationRevision: number | null
  version: number
}

type StoredTool = {
  id: string
  companyId: string
  serverId: string
  remoteName: string
  description: string
  inputSchema: Record<string, unknown>
  enabled: boolean
  available: boolean
  discoveredConnectionRevision: number
  version: number
}

function requireCompany(companyId: string) {
  if (typeof companyId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) {
    throw new Error('Select a valid company.')
  }
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

function validateServer(row: StoredServer, companyId: string) {
  if (
    !row
    || row.companyId !== companyId
    || typeof row.id !== 'string'
    || !/^[A-Za-z0-9_-]{1,36}$/.test(row.id)
    || typeof row.merchantId !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(row.merchantId)
    || typeof row.name !== 'string'
    || !row.name.trim()
    || typeof row.description !== 'string'
    || typeof row.endpointUrl !== 'string'
    || !row.endpointUrl.trim()
    || !Number.isInteger(row.timeoutSeconds)
    || row.timeoutSeconds < 1
    || row.timeoutSeconds > 120
    || !['none', 'api_key'].includes(row.authType)
    || typeof row.enabled !== 'boolean'
    || row.transport !== 'streamable_http'
    || row.protocolVersion !== '2025-11-25'
    || !validVersion(row.version)
    || !validVersion(row.connectionRevision)
    || !['not_verified', 'verified', 'failed']
      .includes(row.verificationStatus)
    || (
      row.verificationRevision !== null
      && !validVersion(row.verificationRevision)
    )
  ) {
    throw new Error('Invalid stored MCP server response.')
  }

  if (
    row.verificationStatus === 'verified'
    && row.verificationRevision !== row.connectionRevision
  ) {
    throw new Error('MCP verification does not match the current connection.')
  }
}

function validateTool(
  row: StoredTool,
  companyId: string,
  serverId: string,
) {
  if (
    !row
    || row.companyId !== companyId
    || row.serverId !== serverId
    || typeof row.id !== 'string'
    || !/^[A-Za-z0-9_-]{1,36}$/.test(row.id)
    || typeof row.remoteName !== 'string'
    || !row.remoteName.trim()
    || typeof row.description !== 'string'
    || typeof row.enabled !== 'boolean'
    || typeof row.available !== 'boolean'
    || !validVersion(row.version)
    || !validVersion(row.discoveredConnectionRevision)
    || !row.inputSchema
    || typeof row.inputSchema !== 'object'
    || Array.isArray(row.inputSchema)
  ) {
    throw new Error('Invalid stored MCP tool response.')
  }
}

export async function fetchMcpTools(
  companyId: string,
  serverId: string,
): Promise<StoredTool[]> {
  requireCompany(companyId)

  if (typeof serverId !== 'string' || !/^[A-Za-z0-9_-]{1,36}$/.test(serverId)) {
    throw new Error('Invalid MCP server ID.')
  }

  const response = await apiRequest<{ items: StoredTool[] }>(
    `/api/ai/mcp/servers/${encodeURIComponent(serverId)}/tools`
      + `?companyId=${encodeURIComponent(companyId)}`,
    { auth: true, cache: 'no-store' },
  )

  if (!response || !Array.isArray(response.items)) {
    throw new Error('Invalid MCP catalog response.')
  }

  const ids = new Set<string>()
  const names = new Set<string>()

  for (const row of response.items) {
    validateTool(row, companyId, serverId)

    if (ids.has(row.id) || names.has(row.remoteName)) {
      throw new Error('Duplicate MCP tool response.')
    }

    ids.add(row.id)
    names.add(row.remoteName)
  }

  return response.items
}

function toServer(
  row: StoredServer,
  tools: StoredTool[],
): McpServer {
  const status: McpServer['status'] = !row.enabled
    ? 'disabled'
    : row.verificationStatus === 'verified'
      ? 'connected'
      : row.verificationStatus === 'failed'
        ? 'error'
        : 'not_verified'

  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: row.description,
    url: row.endpointUrl,
    auth: row.authType === 'api_key' ? 'API Key' : 'None',
    status,

    dataSource: 'database',
    version: row.version,
    connectionRevision: row.connectionRevision,
    verificationStatus: row.verificationStatus,

    // 后端当前没有提供这些统计字段，不生成演示数据。
    clientId: '',
    secret: '',
    latency: null,
    errors: 0,
    checkedAt: null,
    connectedAt: null,

    capabilities: tools.map(tool => ({
      name: tool.remoteName,
      enabled: tool.enabled
        && tool.available
        && tool.discoveredConnectionRevision === row.connectionRevision,
    })),

    // Agent 绑定和活动记录尚未接入。
    agents: [],
    models: [],
    permissions: [],
    activity: [],
  }
}

export async function fetchMcpServers(
  companyId: string,
): Promise<McpServer[]> {
  requireCompany(companyId)

  const response = await apiRequest<{ items: StoredServer[] }>(
    `/api/ai/mcp/servers?companyId=${encodeURIComponent(companyId)}`,
    { auth: true, cache: 'no-store' },
  )

  if (!response || !Array.isArray(response.items)) {
    throw new Error('Invalid MCP server list response.')
  }

  const ids = new Set<string>()

  for (const row of response.items) {
    validateServer(row, companyId)

    if (ids.has(row.id)) {
      throw new Error('Duplicate MCP server response.')
    }

    ids.add(row.id)
  }

  return Promise.all(response.items.map(async row => {
    const tools = await fetchMcpTools(companyId, row.id)
    return toServer(row, tools)
  }))
}
