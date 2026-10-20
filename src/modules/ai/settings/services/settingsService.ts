import { companyFixture, fixtureTime } from './companyFixtures'
import type {
  AiModel,
  AiProvider,
  AiSettingsSummary,
  ProviderConnectionResult,
  SaveModelPayload,
  SaveProviderPayload,
} from '../types/settings'

const USE_MOCK = true

type ProviderSeed = Omit<AiProvider, 'companyId'>
type ModelSeed = AiModel

const PROVIDER_SEEDS: ProviderSeed[] = [
  {
    id: 'provider-openai',
    name: 'OpenAI',
    slug: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: '••••••••••••••••',
    enabled: true,
    status: 'connected',
    lastTestedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    modelCount: 5,
  },
  {
    id: 'provider-anthropic',
    name: 'Anthropic',
    slug: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyMasked: '••••••••••••••••',
    enabled: true,
    status: 'connected',
    lastTestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    modelCount: 3,
  },
  {
    id: 'provider-google',
    name: 'Google',
    slug: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyMasked: '••••••••••••••••',
    enabled: true,
    status: 'connected',
    lastTestedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    modelCount: 2,
  },
  {
    id: 'provider-deepseek',
    name: 'DeepSeek',
    slug: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyMasked: '••••••••••••••••',
    enabled: false,
    status: 'disabled',
    lastTestedAt: null,
    modelCount: 2,
  },
  // Local mock fixtures for pagination and status-filter testing.
  {
    id: 'provider-test-05',
    name: 'Test Source 05',
    slug: 'test-05',
    baseUrl: 'https://source-05.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'connected',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-06',
    name: 'Test Source 06',
    slug: 'test-06',
    baseUrl: 'https://source-06.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'connected',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-07',
    name: 'Test Source 07',
    slug: 'test-07',
    baseUrl: 'https://source-07.example.test/v1',
    apiKeyMasked: '',
    enabled: false,
    status: 'disabled',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-08',
    name: 'Test Source 08',
    slug: 'test-08',
    baseUrl: 'https://source-08.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'error',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-09',
    name: 'Test Source 09',
    slug: 'test-09',
    baseUrl: 'https://source-09.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'connected',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-10',
    name: 'Test Source 10',
    slug: 'test-10',
    baseUrl: 'https://source-10.example.test/v1',
    apiKeyMasked: '',
    enabled: false,
    status: 'disabled',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-11',
    name: 'Test Source 11',
    slug: 'test-11',
    baseUrl: 'https://source-11.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'error',
    lastTestedAt: null,
    modelCount: 0,
  },
  {
    id: 'provider-test-12',
    name: 'Test Source 12',
    slug: 'test-12',
    baseUrl: 'https://source-12.example.test/v1',
    apiKeyMasked: '',
    enabled: true,
    status: 'connected',
    lastTestedAt: null,
    modelCount: 0,
  },
]

const MODEL_SEEDS: ModelSeed[] = [
  // Explicit mock failure to exercise Error independently from Disabled.
  {
    id: 'model-test-error',
    providerId: 'provider-openai',
    name: 'Test Error Model',
    modelId: 'test-error-model',
    type: 'chat',
    status: 'error',
    contextWindow: 128000,
    usedByAgents: 0,
    description: 'Local mock error state for model-status filtering.',
  },
  {
    id: 'model-gpt-5',
    providerId: 'provider-openai',
    name: 'GPT-5',
    modelId: 'gpt-5',
    type: 'chat',
    status: 'enabled',
    contextWindow: 128000,
    usedByAgents: 6,
    description: 'General-purpose flagship model.',
  },
  {
    id: 'model-gpt-5-mini',
    providerId: 'provider-openai',
    name: 'GPT-5 mini',
    modelId: 'gpt-5-mini',
    type: 'chat',
    status: 'enabled',
    contextWindow: 128000,
    usedByAgents: 8,
    description: 'Fast, cost-efficient general model.',
  },
  {
    id: 'model-o3',
    providerId: 'provider-openai',
    name: 'o3',
    modelId: 'o3',
    type: 'reasoning',
    status: 'enabled',
    contextWindow: 200000,
    usedByAgents: 3,
    description: 'Reasoning-focused model.',
  },
  {
    id: 'model-o4-mini',
    providerId: 'provider-openai',
    name: 'o4-mini',
    modelId: 'o4-mini',
    type: 'reasoning',
    status: 'disabled',
    contextWindow: 200000,
    usedByAgents: 0,
    description: 'Compact reasoning model.',
  },
  {
    id: 'model-embedding',
    providerId: 'provider-openai',
    name: 'Text Embedding 3 Large',
    modelId: 'text-embedding-3-large',
    type: 'embedding',
    status: 'enabled',
    contextWindow: 8191,
    usedByAgents: 0,
    description: 'Embedding model for semantic retrieval.',
  },
  {
    id: 'model-claude-sonnet',
    providerId: 'provider-anthropic',
    name: 'Claude Sonnet',
    modelId: 'claude-sonnet-4',
    type: 'chat',
    status: 'enabled',
    contextWindow: 200000,
    usedByAgents: 4,
    description: 'General-purpose Claude model.',
  },
  {
    id: 'model-claude-haiku',
    providerId: 'provider-anthropic',
    name: 'Claude Haiku',
    modelId: 'claude-3-5-haiku-latest',
    type: 'chat',
    status: 'enabled',
    contextWindow: 200000,
    usedByAgents: 2,
    description: 'Fast Claude model.',
  },
  {
    id: 'model-gemini',
    providerId: 'provider-google',
    name: 'Gemini Flash',
    modelId: 'gemini-2.5-flash',
    type: 'chat',
    status: 'enabled',
    contextWindow: 1000000,
    usedByAgents: 2,
    description: 'Fast multimodal Gemini model.',
  },
  {
    id: 'model-deepseek',
    providerId: 'provider-deepseek',
    name: 'DeepSeek Chat',
    modelId: 'deepseek-chat',
    type: 'chat',
    status: 'disabled',
    contextWindow: 128000,
    usedByAgents: 0,
    description: 'DeepSeek chat model.',
  },
]

// Disposable local fixtures for exercising long lists, filters and bulk removal.
MODEL_SEEDS.push(...Array.from({ length: 300 }, (_, index): ModelSeed => {
  const number = String(index + 1).padStart(3, '0')
  return {
    id: `model-openai-test-${number}`,
    providerId: 'provider-openai',
    name: `OpenAI Test Model ${number}`,
    modelId: `openai-test-${number}`,
    type: index % 3 === 0 ? 'chat' : index % 3 === 1 ? 'reasoning' : 'embedding',
    status: index % 3 === 0 ? 'enabled' : index % 3 === 1 ? 'disabled' : 'error',
    contextWindow: 128000,
    usedByAgents: 0,
    description: 'Local test fixture for scrolling, pagination and filtered bulk removal.',
  }
}))

let providers: AiProvider[] = []
let models: AiModel[] = []
const initializedCompanies = new Set<string>()

function ensureCompany(companyId: string) {
  const fixture = companyFixture(companyId)
  if (initializedCompanies.has(companyId)) return
  const selectedProviders = PROVIDER_SEEDS.filter(provider => provider.slug in fixture.providers)
  providers.push(...selectedProviders.map((provider,index) => ({
    ...provider, companyId, id:provider.id+'-'+companyId,
    status:fixture.providers[provider.slug],
    enabled:fixture.providers[provider.slug]!=='disabled',
    lastTestedAt:fixture.providers[provider.slug]==='disabled'?null:fixtureTime(45+index*17),
  })))
  const providerMap = new Map(selectedProviders.map(provider => [provider.id,provider]))
  const selectedModels = MODEL_SEEDS.filter(model =>
    fixture.modelIds.includes(model.modelId) ||
    (fixture.testModels>0 && model.modelId.startsWith('openai-test-') && Number(model.modelId.slice(12))<=fixture.testModels)
  )
  models.push(...selectedModels.filter(model=>providerMap.has(model.providerId)).map(model => {
    const provider=providerMap.get(model.providerId)!
    const providerStatus=fixture.providers[provider.slug]
    const status=providerStatus==='disabled'?'disabled':fixture.modelStates?.[model.modelId]??model.status
    return {...model,id:model.id+'-'+companyId,providerId:model.providerId+'-'+companyId,
      status,usedByAgents:companyId==='company-j1'?model.usedByAgents:0}
  }))
  initializedCompanies.add(companyId)
  providers.filter(provider=>provider.companyId===companyId).forEach(provider=>recalcProviderCount(provider.id))
}

export async function fetchRuntimeDefaults(companyId:string) {
  ensureCompany(companyId)
  const fixture=companyFixture(companyId)
  const enabled=models.filter(model=>model.status==='enabled'&&providers.some(provider=>provider.id===model.providerId&&provider.companyId===companyId&&provider.status==='connected'))
  const model=enabled.find(model=>model.modelId===fixture.runtime.model)
  const fallback=enabled.find(model=>model.modelId===fixture.runtime.fallback)
  return {
    provider:model?providers.find(provider=>provider.id===model.providerId)!.name:'Not configured',
    model:model?.name??'Not configured',fallbackModel:fallback?.name??'Not configured',
    routing:model?fixture.runtime.routing:'Not configured',
  }
}

function delay(ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cloneProvider(provider: AiProvider): AiProvider {
  return { ...provider }
}

function cloneModel(model: AiModel): AiModel {
  return { ...model }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function recalcProviderCount(providerId: string) {
  const provider = providers.find((item) => item.id === providerId)
  if (!provider) return
  provider.modelCount = models.filter((model) => model.providerId === providerId).length
}

export async function fetchSettingsSummary(
  companyId: string,
): Promise<AiSettingsSummary> {
  if (!USE_MOCK) {
    throw new Error('AI Settings API is not connected.')
  }

  ensureCompany(companyId)
  await delay()

  const companyProviders = providers.filter(
    (provider) => provider.companyId === companyId,
  )
  const providerIds = new Set(companyProviders.map((provider) => provider.id))
  const companyModels = models.filter((model) => providerIds.has(model.providerId))

  return {
    providers: companyProviders.length,
    connectedProviders: companyProviders.filter(
      (provider) => provider.status === 'connected',
    ).length,
    models: companyModels.length,
    enabledModels: companyModels.filter((model) => model.status === 'enabled').length,
  }
}

export async function fetchProviders(
  companyId: string,
): Promise<{ items: AiProvider[] }> {
  if (!USE_MOCK) {
    throw new Error('Provider API is not connected.')
  }

  ensureCompany(companyId)
  await delay()
  return {
    items: providers
      .filter((provider) => provider.companyId === companyId)
      .map(cloneProvider),
  }
}

export async function fetchProvider(providerId: string): Promise<AiProvider> {
  await delay()
  const provider = providers.find((item) => item.id === providerId)
  if (!provider) throw new Error(`Provider ${providerId} not found.`)
  return cloneProvider(provider)
}

export async function createProvider(
  payload: SaveProviderPayload,
): Promise<AiProvider> {
  ensureCompany(payload.companyId)
  await delay()
  const id = `provider-${slugify(payload.name) || 'custom'}-${crypto.randomUUID()
    .replace(/-/g, '')
    .slice(0, 8)}`

  const provider: AiProvider = {
    id,
    companyId: payload.companyId,
    name: payload.name.trim(),
    slug: slugify(payload.name),
    baseUrl: payload.baseUrl.trim(),
    apiKeyMasked: payload.apiKey ? '••••••••••••••••' : '',
    enabled: payload.enabled,
    status: payload.enabled ? 'connected' : 'disabled',
    lastTestedAt: payload.enabled ? new Date().toISOString() : null,
    modelCount: 0,
  }

  providers.push(provider)
  return cloneProvider(provider)
}

export async function updateProvider(
  providerId: string,
  payload: SaveProviderPayload,
): Promise<AiProvider> {
  await delay()
  const provider = providers.find((item) => item.id === providerId)
  if (!provider || provider.companyId !== payload.companyId) throw new Error('Provider is not available in this company.')

  provider.name = payload.name.trim()
  provider.slug = slugify(payload.name)
  provider.baseUrl = payload.baseUrl.trim()
  if (payload.apiKey) provider.apiKeyMasked = '••••••••••••••••'
  provider.enabled = payload.enabled
  provider.status = payload.enabled ? 'connected' : 'disabled'

  return cloneProvider(provider)
}

export async function setProviderEnabled(
  providerId: string,
  enabled: boolean,
): Promise<AiProvider> {
  const provider = providers.find((item) => item.id === providerId)
  if (!provider) throw new Error(`Provider ${providerId} not found.`)

  provider.enabled = enabled
  provider.status = enabled ? 'connected' : 'disabled'
  return cloneProvider(provider)
}

export async function deleteProvider(providerId: string): Promise<void> {
  const provider = providers.find((item) => item.id === providerId)
  if (!provider) throw new Error('Provider not found.')
  if (provider.enabled || provider.status !== 'disabled') {
    throw new Error('Disable the provider before deleting it.')
  }
  if (models.some((model) => model.providerId === providerId && model.usedByAgents > 0)) {
    throw new Error('Remove this provider’s models from connected agents before deleting it.')
  }
  providers = providers.filter((item) => item.id !== providerId)
  models = models.filter((model) => model.providerId !== providerId)
}

export async function testProviderConnection(input: {
  providerId?: string
  baseUrl: string
  apiKey?: string
}): Promise<ProviderConnectionResult> {
  await delay(650)

  const checkedAt = new Date().toISOString()
  const validUrl = /^https?:\/\/\S+/i.test(input.baseUrl.trim())

  if (!validUrl) {
    return {
      ok: false,
      message: 'Enter a valid HTTP or HTTPS Base URL.',
      checkedAt,
    }
  }

  if (input.providerId) {
    const provider = providers.find((item) => item.id === input.providerId)
    if (provider) {
      provider.lastTestedAt = checkedAt
      if (provider.enabled) provider.status = 'connected'
    }
  }

  return {
    ok: true,
    message: 'Connection successful.',
    checkedAt,
  }
}

export async function fetchProviderModels(
  providerId: string,
): Promise<{ items: AiModel[] }> {
  await delay()
  return {
    items: models
      .filter((model) => model.providerId === providerId)
      .map(cloneModel),
  }
}

export async function createModel(
  payload: SaveModelPayload,
): Promise<AiModel> {
  await delay()
  if (!providers.some(provider => provider.id === payload.providerId)) throw new Error('Provider is not available.')
  const model: AiModel = {
    id: `model-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    providerId: payload.providerId,
    name: payload.name.trim(),
    modelId: payload.modelId.trim(),
    type: payload.type,
    status: payload.enabled ? 'enabled' : 'disabled',
    contextWindow: payload.contextWindow,
    usedByAgents: 0,
    description: payload.description?.trim() ?? '',
  }

  models.push(model)
  recalcProviderCount(payload.providerId)
  return cloneModel(model)
}

export async function updateModel(
  modelId: string,
  payload: SaveModelPayload,
): Promise<AiModel> {
  await delay()
  const model = models.find((item) => item.id === modelId)
  if (!model) throw new Error(`Model ${modelId} not found.`)
  if (model.providerId !== payload.providerId) throw new Error('Model is not available in this provider.')

  model.name = payload.name.trim()
  model.modelId = payload.modelId.trim()
  model.type = payload.type
  model.status = payload.enabled ? (model.status === 'error' ? 'error' : 'enabled') : 'disabled'
  model.contextWindow = payload.contextWindow
  model.description = payload.description?.trim() ?? ''

  return cloneModel(model)
}

export async function setModelEnabled(
  modelId: string,
  enabled: boolean,
): Promise<AiModel> {
  await delay()
  const model = models.find((item) => item.id === modelId)
  if (!model) throw new Error(`Model ${modelId} not found.`)

  model.status = enabled ? (model.status === 'error' ? 'error' : 'enabled') : 'disabled'
  return cloneModel(model)
}

export async function deleteModel(modelId: string): Promise<void> {
  const model = models.find((item) => item.id === modelId)
  if (!model) throw new Error('Model not found.')
  if (model.status !== 'disabled') throw new Error('Disable the model before deleting it.')
  if (model.usedByAgents > 0) throw new Error('Remove this model from connected agents before deleting it.')
  models = models.filter((item) => item.id !== modelId)
  recalcProviderCount(model.providerId)
}

/** Validate the entire selection before changing the local mock store. */
export async function deleteProviders(companyId: string, ids: string[]): Promise<void> {
  const unique = new Set(ids)
  if (!unique.size) throw new Error('Select disabled providers to remove.')
  const selected = providers.filter(item => unique.has(item.id))
  if (selected.length !== unique.size || selected.some(item => item.companyId !== companyId)) throw new Error('The provider selection has changed. Refresh and try again.')
  if (selected.some(item => item.enabled || item.status !== 'disabled')) throw new Error('Only disabled providers can be removed.')
  if (models.some(item => unique.has(item.providerId) && item.usedByAgents > 0)) throw new Error('Remove the selected providers’ models from connected agents first.')
  providers = providers.filter(item => !unique.has(item.id))
  models = models.filter(item => !unique.has(item.providerId))
}

export async function deleteModels(providerId: string, ids: string[]): Promise<void> {
  const unique = new Set(ids)
  if (!unique.size) throw new Error('Select disabled models to remove.')
  const selected = models.filter(item => unique.has(item.id))
  if (selected.length !== unique.size || selected.some(item => item.providerId !== providerId)) throw new Error('The model selection has changed. Refresh and try again.')
  if (selected.some(item => item.status !== 'disabled')) throw new Error('Only disabled models can be removed.')
  if (selected.some(item => item.usedByAgents > 0)) throw new Error('Remove the selected models from connected agents first.')
  models = models.filter(item => !unique.has(item.id))
  recalcProviderCount(providerId)
}
