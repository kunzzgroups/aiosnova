import type { ModelCapabilities } from '../services/modelCapabilitiesService'
export type ProviderStatus = 'connected' | 'disabled' | 'error' | 'not_verified'
export type ModelStatus = 'enabled' | 'disabled' | 'error'
export type ModelType = 'chat' | 'reasoning' | 'embedding' | 'other'

export type AiProvider = {
  id: string
  companyId: string
  version: number
  name: string
  slug: string
  baseUrl: string
  apiKeyMasked: string
  enabled: boolean
  status: ProviderStatus
  lastTestedAt: string | null
  lastConnectionTest?: {
    ok: boolean
    message: string
    modelId: string
    checkedAt: string
  }
  activity?: { id: string; time: string; message: string; status?: 'success' | 'error' | 'neutral' }[]
  modelCount: number
}

export type AiModel = {
  id: string
  providerId: string
  version: number
  name: string
  modelId: string
  type: ModelType
  status: ModelStatus
  contextWindow: number | null
  catalogContextWindow?: number | null
  configuredContextWindow?: number | null
  usedByAgents: number
  description: string
  capabilities?: ModelCapabilities
  capabilitiesCheckedAt?: string
  capabilityError?: string
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

export type AiSettingsSummary = {
  providers: number
  connectedProviders: number
  models: number
  enabledModels: number
}
