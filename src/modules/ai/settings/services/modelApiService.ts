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

  let message = `模型请求失败，HTTP 状态码：${response.status}`

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
    throw new Error('后端返回的模型列表格式异常')
  }

  if (
    result.items.some(
      model =>
        model.companyId !== companyId ||
        model.providerId !== providerId,
    )
  ) {
    throw new Error('后端返回了不属于当前公司或 Provider 的模型')
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
    throw new Error('同步响应格式异常，请重新读取模型列表确认结果')
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