import {
  fetchStoredTool,
  fetchStoredTools,
  saveStoredTool,
  saveStoredToolAgents,
  setStoredToolEnabled,
} from './toolApiService'

import type {
  AiTool,
  SaveToolPayload,
} from '../types/tools'

export async function fetchTools(
  companyId: string,
): Promise<AiTool[]> {
  return fetchStoredTools(companyId)
}

export async function fetchTool(
  companyId: string,
  id: string,
): Promise<AiTool> {
  return fetchStoredTool(companyId, id)
}

function writesNotConnected(): never {
  throw new Error(
    'Tool deletion is not connected yet.',
  )
}

export async function saveTool(
  companyId: string,
  payload: SaveToolPayload,
  original?: AiTool,
): Promise<AiTool> {
  return saveStoredTool(companyId, payload, original)
}

export async function saveToolAgents(
  companyId: string,
  tool: AiTool,
  agentIds: string[],
): Promise<AiTool> {
  return saveStoredToolAgents(companyId, tool, agentIds)
}

export async function setToolEnabled(
  companyId: string,
  tool: AiTool,
  enabled: boolean,
): Promise<AiTool> {
  return setStoredToolEnabled(companyId, tool, enabled)
}

export async function deleteTool(
  _companyId: string,
  _id: string,
): Promise<void> {
  writesNotConnected()
}

export async function deleteTools(
  _companyId: string,
  _ids: string[],
): Promise<void> {
  writesNotConnected()
}
