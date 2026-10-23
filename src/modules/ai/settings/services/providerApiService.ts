import type { SaveProviderPayload } from '../types/settings'
import type { ConnectionTestResult } from './connectionService'

export async function testStoredProviderConnection(
  companyId: string, providerId: string, modelId: string, version: number,
): Promise<ConnectionTestResult> {
  const response = await fetch(`/api/ai/providers/${encodeURIComponent(providerId)}/test-connection`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, modelId, version }),
  })
  await checkResponse(response)
  const result: ConnectionTestResult = await response.json()
  if (typeof result.ok !== 'boolean' || typeof result.message !== 'string') throw new Error('Invalid connection test response.')
  return result
}

// 对应 Java 返回的 ProviderSummary。
// 这里没有 API Key，也没有密文。
export type ProviderSummary = {
  id: string
  companyId: string
  name: string
  providerType: string
  baseUrl: string
  enabled: boolean
  hasApiKey: boolean
  version: number
}

async function checkResponse(response: Response): Promise<void> {
  if (response.ok) return

  let message = `Provider request failed. HTTP status: ${response.status}`

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
    // 后端没有返回 JSON 时，使用上面的状态码提示。
  }

  throw new Error(message)
}

export async function listStoredProviders(
  companyId: string,
): Promise<ProviderSummary[]> {
  const params = new URLSearchParams({ companyId })

  const response = await fetch(`/api/ai/providers?${params}`, {
    cache: 'no-store',
  })

  await checkResponse(response)

  const result: { items: ProviderSummary[] } = await response.json()

  return result.items
}

export async function createStoredProvider(
  payload: SaveProviderPayload,
): Promise<ProviderSummary> {
  const response = await fetch('/api/ai/providers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId: payload.companyId,
      name: payload.name.trim(),
      baseUrl: payload.baseUrl.trim(),
      enabled: payload.enabled,
      apiKey: payload.apiKey?.trim(),
    }),
  })

  await checkResponse(response)

  const result: ProviderSummary = await response.json()

  return result
}

export async function updateStoredProvider(
  providerId: string,
  payload: SaveProviderPayload,
  version: number,
): Promise<ProviderSummary> {
  const response = await fetch(
    `/api/ai/providers/${encodeURIComponent(providerId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId: payload.companyId,
        name: payload.name.trim(),
        baseUrl: payload.baseUrl.trim(),
        enabled: payload.enabled,
        apiKey: payload.apiKey?.trim(),
        version,
      }),
    },
  )

  await checkResponse(response)

  const result: ProviderSummary = await response.json()

  return result
}

export async function setStoredProviderEnabled(
  companyId: string,
  providerId: string,
  enabled: boolean,
  version: number,
): Promise<ProviderSummary> {
  const response = await fetch(
    `/api/ai/providers/${encodeURIComponent(providerId)}/enabled`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyId,
        enabled,
        version,
      }),
    },
  )

  await checkResponse(response)

  const result: ProviderSummary = await response.json()

  return result
}

export async function deleteStoredProvider(
  companyId: string,
  providerId: string,
  version: number,
): Promise<void> {
  const params = new URLSearchParams({
    companyId,
    version: String(version),
  })

  const response = await fetch(
    `/api/ai/providers/${encodeURIComponent(providerId)}?${params}`,
    {
      method: 'DELETE',
    },
  )

  await checkResponse(response)
}

export async function deleteStoredProviders(
  companyId: string,
  items: { id: string; version: number }[],
): Promise<{ deleted: number }> {
  const response = await fetch('/api/ai/providers/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, items }),
  })

  await checkResponse(response)

  return response.json()
}
