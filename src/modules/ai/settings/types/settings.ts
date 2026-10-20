export type ProviderStatus = 'connected' | 'disabled' | 'error'
export type ModelStatus = 'enabled' | 'disabled' | 'error'
export type ModelType = 'chat' | 'reasoning' | 'embedding'

export type AiProvider = {
  id: string
  companyId: string
  name: string
  slug: string
  baseUrl: string
  apiKeyMasked: string
  enabled: boolean
  status: ProviderStatus
  lastTestedAt: string | null
  modelCount: number
}

export type AiModel = {
  id: string
  providerId: string
  name: string
  modelId: string
  type: ModelType
  status: ModelStatus
  contextWindow: number
  usedByAgents: number
  description: string
}

export type SaveProviderPayload = {
  companyId: string
  name: string
  baseUrl: string
  apiKey?: string
  enabled: boolean
}

export type SaveModelPayload = {
  providerId: string
  name: string
  modelId: string
  type: ModelType
  contextWindow: number
  enabled: boolean
  description?: string
}

export type ProviderConnectionResult = {
  ok: boolean
  message: string
  checkedAt: string
}

export type AiSettingsSummary = {
  providers: number
  connectedProviders: number
  models: number
  enabledModels: number
}
