export type ModelPreferences = {
  companyId: string
  defaultModelConfigId: string | null
  recommendedModelConfigIds: string[]
  version: number
  storageReady: boolean
}

async function request(url: string, init?: RequestInit): Promise<ModelPreferences> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message ?? `Model preferences request failed (${response.status}).`)
  if (!Array.isArray(result.recommendedModelConfigIds) || !Number.isSafeInteger(result.version) || typeof result.storageReady !== 'boolean')
    throw new Error('Invalid model preferences response.')
  return result
}

export async function fetchModelPreferences(companyId: string): Promise<ModelPreferences> {
  const result = await request(`/api/ai/model-preferences?${new URLSearchParams({ companyId })}`)
  if (result.companyId !== companyId) throw new Error('Model preferences belong to a different company.')
  return result
}

export async function saveModelPreferences(input: ModelPreferences): Promise<ModelPreferences> {
  const result = await request('/api/ai/model-preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  if (result.companyId !== input.companyId || result.version !== input.version + 1) throw new Error('Preferences response did not match the saved company/version. Reload to confirm.')
  return result
}
