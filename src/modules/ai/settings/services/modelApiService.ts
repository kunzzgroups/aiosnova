import type {
  ModelStatus,
  ModelType,
} from '../types/settings'

import type {
  ModelCapabilities,
} from './modelCapabilitiesService'

export type StoredModelSummary = {
  id: string
  companyId: string
  providerId: string
  modelId: string
  name: string
  type: ModelType
  status: ModelStatus
  description: string
  contextWindow: number | null
  capabilities: ModelCapabilities | null
  capabilitiesCheckedAt: string | null
  capabilityError: string | null
  version: number
}

export type StoredModelList = {
  items: StoredModelSummary[]
  count: number
}

export type StoredModelSyncResult = {
  created: number
  updated: number
  capabilityWarnings: string[]
}

async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return

  let message = `Model request failed. HTTP status: ${response.status}`

  try {
    const body: unknown = await response.json()

    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string' &&
      body.message.trim()
    ) {
      message = body.message
    }
  } catch {
    // 没有有效 JSON 正文时，使用状态码提示。
  }

  throw new Error(message)
}

export async function setStoredModelsEnabled(
  companyId: string, providerId: string, enabled: boolean,
  items: { id: string; version: number }[],
): Promise<void> {
  const response = await fetch('/api/ai/models/bulk-enabled', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, providerId, enabled, items }),
  })
  await checkResponse(response)
  const result = await response.json()
  if (result.updated !== items.length) throw new Error('The updated count did not match. Reload the list to confirm.')
}

export type CompanyModelTarget = { providerId: string; id: string; version: number }

export async function mutateCompanyModels(companyId: string, items: CompanyModelTarget[], action: 'enable' | 'disable' | 'delete'): Promise<void> {
  const deleting = action === 'delete'
  const response = await fetch(`/api/ai/models/${deleting ? 'company-bulk-delete' : 'company-bulk-enabled'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, items, ...(deleting ? {} : { enabled: action === 'enable' }) }),
  })
  await checkResponse(response)
  const result = await response.json()
  if (result[deleting ? 'deleted' : 'updated'] !== items.length)
    throw new Error('The result count did not match. Reload the model list to confirm.')
}

export async function listStoredModels(
  companyId: string,
  providerId: string,
): Promise<StoredModelList> {
  const params = new URLSearchParams({
    companyId,
    providerId,
  })

  const response = await fetch(`/api/ai/models?${params}`, {
    cache: 'no-store',
  })

  await checkResponse(response)

  const result: StoredModelList = await response.json()

  if (
    !Array.isArray(result.items) ||
    result.count !== result.items.length
  ) {
    throw new Error('Invalid model list response.')
  }

  if (
    result.items.some(
      model =>
        model.companyId !== companyId ||
        model.providerId !== providerId,
    )
  ) {
    throw new Error('Returned models belong to another company or Provider.')
  }

  return result
}

export async function syncStoredProviderModels(
  companyId: string,
  providerId: string,
): Promise<StoredModelSyncResult> {
  const response = await fetch('/api/ai/models/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId,
      providerId,
    }),
  })

  await checkResponse(response)

  const result: StoredModelSyncResult = await response.json()

  if (
    !Number.isSafeInteger(result.created) ||
    result.created < 0 ||
    !Number.isSafeInteger(result.updated) ||
    result.updated < 0 ||
    !Array.isArray(result.capabilityWarnings) ||
    result.capabilityWarnings.some(
      warning => typeof warning !== 'string',
    )
  ) {
    throw new Error('Invalid sync response. Reload the model list to confirm.')
  }

  return result
}

export async function setStoredModelEnabled(
  companyId: string,
  providerId: string,
  modelConfigId: string,
  enabled: boolean,
  version: number,
): Promise<StoredModelSummary> {
  const response = await fetch(
    `/api/ai/models/${encodeURIComponent(modelConfigId)}/enabled`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId,
        providerId,
        enabled,
        version,
      }),
    },
  )

  await checkResponse(response)

  const result: StoredModelSummary = await response.json()

  return result
}

export type UpdateStoredModelInput = {
  companyId: string
  providerId: string
  name: string
  type: ModelType
  enabled: boolean
  description: string
  contextWindow: number | null
  version: number
}

export async function updateStoredModel(
  modelConfigId: string,
  input: UpdateStoredModelInput,
): Promise<StoredModelSummary> {
  const response = await fetch(
    `/api/ai/models/${encodeURIComponent(modelConfigId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  await checkResponse(response)

  const result: StoredModelSummary = await response.json()

  if (
    result.id !== modelConfigId ||
    result.companyId !== input.companyId ||
    result.providerId !== input.providerId ||
    result.version !== input.version + 1
  ) {
    throw new Error(
      'Model configuration response did not match. Reload to confirm.',
    )
  }

  return result
}

export async function deleteStoredModel(
  companyId: string,
  providerId: string,
  modelConfigId: string,
  version: number,
): Promise<void> {
  const params = new URLSearchParams({
    companyId,
    providerId,
    version: String(version),
  })

  const response = await fetch(
    `/api/ai/models/${encodeURIComponent(modelConfigId)}?${params}`,
    {
      method: 'DELETE',
    },
  )

  await checkResponse(response)

  if (response.status !== 204) {
    throw new Error('Invalid delete response. Reload the model list to confirm.')
  }
}

export type DeleteStoredModelTarget = {
  id: string
  version: number
}

export async function deleteStoredModels(
  companyId: string,
  providerId: string,
  items: DeleteStoredModelTarget[],
): Promise<{ deleted: number }> {
  const response = await fetch('/api/ai/models/bulk-delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId,
      providerId,
      items,
    }),
  })

  await checkResponse(response)

  const result: { deleted: number } = await response.json()

  if (
    !Number.isSafeInteger(result.deleted) ||
    result.deleted !== items.length
  ) {
    throw new Error('Deleted count did not match the request. Reload to confirm.')
  }

  return result
}

export type CreateStoredModelInput = {
  companyId: string
  providerId: string
  modelId: string
  name: string
  type: ModelType
  description: string
  contextWindow: number | null
}

export async function createStoredModel(
  input: CreateStoredModelInput,
): Promise<StoredModelSummary> {
  const response = await fetch('/api/ai/models', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  await checkResponse(response)

  const result: StoredModelSummary = await response.json()

  if (
    response.status !== 201 ||
    typeof result.id !== 'string' ||
    !result.id ||
    result.companyId !== input.companyId ||
    result.providerId !== input.providerId ||
    result.modelId !== input.modelId ||
    result.status !== 'disabled' ||
    result.version !== 0
  ) {
    throw new Error('Invalid create response. Reload the model list to confirm.')
  }

  return result
}

export async function refreshStoredModelCapabilities(
  companyId: string,
  providerId: string,
  modelConfigId: string,
  version: number,
): Promise<StoredModelSummary> {
  const response = await fetch(
    `/api/ai/models/${encodeURIComponent(modelConfigId)}/refresh-capabilities`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId,
        providerId,
        version,
      }),
    },
  )

  await checkResponse(response)

  const result: StoredModelSummary = await response.json()

  if (
    result.id !== modelConfigId ||
    result.companyId !== companyId ||
    result.providerId !== providerId ||
    result.version !== version + 1
  ) {
    throw new Error('Invalid capability refresh response. Reload the model list to confirm.')
  }

  return result
}
