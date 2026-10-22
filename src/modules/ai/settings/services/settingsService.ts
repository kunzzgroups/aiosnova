import type {
  AiModel,
  AiProvider,
  AiSettingsSummary,
  SaveModelPayload,
  SaveProviderPayload,
} from '../types/settings'
import type { ConnectionTestResult } from './connectionService'
import {
  createStoredProvider,
  deleteStoredProvider,
  deleteStoredProviders,
  listStoredProviders,
  setStoredProviderEnabled,
  updateStoredProvider,
  type ProviderSummary,
} from './providerApiService'
import {
  listStoredModels,
  syncStoredProviderModels,
  setStoredModelEnabled,
  type StoredModelSummary,
} from './modelApiService'

// Provider 和模型列表来自数据库。
// providers、models 只作为运行时缓存。

export type AssistantModelOption = {
  id: string
  providerId: string
  modelId: string
  label: string
}

export type ModelSyncResult = {
  created: number
  updated: number
  capabilityWarnings: string[]
}

// 写入完成后，旧列表响应不能覆盖当前缓存；同公司并发读取共用请求。
const providerCacheVersions = new Map<string, number>()
const providerListRequests = new Map<string, { version: number; request: Promise<ProviderSummary[]> }>()
function advanceProviderCache(companyId: string): number {
  const version = (providerCacheVersions.get(companyId) ?? 0) + 1
  providerCacheVersions.set(companyId, version)
  return version
}

let providers: AiProvider[] = []
let models: AiModel[] = []
function ensureCompany(companyId: string) {
  if (!companyId.trim()) throw new Error('Company is required.')
}

export async function fetchRuntimeDefaults(companyId: string) {
  ensureCompany(companyId)
  const enabled = models.filter(model =>
    model.status === 'enabled' &&
    (model.type === 'chat' || model.type === 'reasoning') &&
    model.capabilities?.chat !== false &&
    providers.some(provider => provider.id === model.providerId && provider.companyId === companyId && provider.enabled && provider.baseUrl.trim() === 'https://openrouter.ai/api/v1')
  )
  const model = enabled[0]
  return {
    provider: model ? providers.find(provider => provider.id === model.providerId)!.name : 'Not configured',
    model: model?.name ?? 'Not configured',
    fallbackModel: 'Not configured',
    routing: model ? 'Enabled models in this company' : 'Not configured',
  }
}

function delay(ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function cloneProvider(provider: AiProvider): AiProvider {
  return structuredClone(provider)
}
function logProvider(provider: AiProvider, message: string, status: 'success' | 'error' | 'neutral' = 'neutral', time = new Date().toISOString()) {
  provider.activity ??= []
  provider.activity.unshift({ id: crypto.randomUUID(), time, message, status })
}

function cloneModel(model: AiModel): AiModel {
  return structuredClone(model)
}

function toAiModel(summary: StoredModelSummary): AiModel {
  return {
    id: summary.id,
    providerId: summary.providerId,
    version: summary.version,
    modelId: summary.modelId,
    name: summary.name,
    type: summary.type,
    status: summary.status,
    description: summary.description,
    contextWindow: summary.contextWindow,

    // 模型与 Agent 的实际关联统计尚未接入。
    usedByAgents: 0,

    capabilities: summary.capabilities ?? undefined,
    capabilitiesCheckedAt:
      summary.capabilitiesCheckedAt ?? undefined,
    capabilityError:
      summary.capabilityError ??
      (summary.capabilities ? undefined : '模型能力未知'),
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function toAiProvider(summary: ProviderSummary): AiProvider {
  const previous = providers.find(provider =>
    provider.id === summary.id && provider.companyId === summary.companyId &&
    provider.version === summary.version && provider.baseUrl === summary.baseUrl &&
    provider.enabled === summary.enabled,
  )
  return {
    id: summary.id,
    companyId: summary.companyId,
    version: summary.version,
    name: summary.name,
    slug: slugify(summary.name),
    baseUrl: summary.baseUrl,
    apiKeyMasked: summary.hasApiKey ? '••••••••••••••••' : '',
    enabled: summary.enabled,
    status: summary.enabled ? previous?.status ?? 'not_verified' : 'disabled',
    lastTestedAt: previous?.lastTestedAt ?? null,
    lastConnectionTest: previous?.lastConnectionTest,
    activity: previous?.activity,
    modelCount: models.filter(
      model => model.providerId === summary.id,
    ).length,
  }
}

function recalcProviderCount(providerId: string) {
  const provider = providers.find((item) => item.id === providerId)
  if (!provider) return
  provider.modelCount = models.filter((model) => model.providerId === providerId).length
}

export async function fetchSettingsSummary(
  companyId: string,
): Promise<AiSettingsSummary> {
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
  ensureCompany(companyId)

  const requestVersion = providerCacheVersions.get(companyId) ?? 0
  let pending = providerListRequests.get(companyId)
  if (!pending || pending.version !== requestVersion) {
    pending = { version: requestVersion, request: listStoredProviders(companyId) }
    providerListRequests.set(companyId, pending)
  }
  let summaries: ProviderSummary[]
  try {
    summaries = await pending.request
  } finally {
    if (providerListRequests.get(companyId) === pending) providerListRequests.delete(companyId)
  }

  if (summaries.some(item => item.companyId !== companyId)) {
    throw new Error('后端返回了不属于当前公司的 Provider。')
  }

  if ((providerCacheVersions.get(companyId) ?? 0) !== requestVersion) {
    return { items: providers.filter(provider => provider.companyId === companyId).map(cloneProvider) }
  }

  const items = summaries.map(toAiProvider)

  // 替换当前公司的缓存，保留其他公司的缓存。
  providers = [
    ...providers.filter(provider => provider.companyId !== companyId),
    ...items,
  ]

  return {
    items: items.map(cloneProvider),
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

  const summary = await createStoredProvider(payload)

  if (summary.companyId !== payload.companyId) {
    throw new Error('新增结果的公司 ID 不一致，请重新加载列表确认。')
  }

  const provider = toAiProvider(summary)

  advanceProviderCache(payload.companyId)
  providers = [
    ...providers.filter(item => item.id !== provider.id),
    provider,
  ]

  return cloneProvider(provider)
}

export async function updateProvider(
  providerId: string,
  payload: SaveProviderPayload,
  expectedVersion?: number,
): Promise<AiProvider> {
  ensureCompany(payload.companyId)

  const existing = providers.find(
    provider =>
      provider.id === providerId &&
      provider.companyId === payload.companyId,
  )

  if (!existing) {
    throw new Error('当前公司中未找到该 Provider，请刷新列表。')
  }

  const summary = await updateStoredProvider(
    providerId,
    payload,
    expectedVersion ?? existing.version,
  )

  if (
    summary.id !== providerId ||
    summary.companyId !== payload.companyId
  ) {
    throw new Error('后端返回的 Provider 不一致，请刷新列表确认。')
  }

  const updated = toAiProvider(summary)

  advanceProviderCache(payload.companyId)
  providers = providers.map(provider =>
    provider.id === updated.id &&
      provider.companyId === updated.companyId
      ? updated
      : provider,
  )

  return cloneProvider(updated)
}

export async function setProviderEnabled(
  providerId: string,
  enabled: boolean,
  companyId: string,
): Promise<AiProvider> {
  ensureCompany(companyId)

  const existing = providers.find(
    provider =>
      provider.id === providerId &&
      provider.companyId === companyId,
  )

  if (!existing) {
    throw new Error('当前公司中未找到该 Provider，请刷新列表。')
  }

  const summary = await setStoredProviderEnabled(
    companyId,
    providerId,
    enabled,
    existing.version,
  )

  if (
    summary.id !== providerId ||
    summary.companyId !== companyId
  ) {
    throw new Error('后端返回的 Provider 不一致，请刷新列表确认。')
  }

  const updated = toAiProvider(summary)

  advanceProviderCache(companyId)
  providers = providers.map(provider =>
    provider.id === updated.id &&
      provider.companyId === updated.companyId
      ? updated
      : provider,
  )

  return cloneProvider(updated)
}

export function recordProviderConnectionTest(
  companyId: string,
  providerId: string,
  baseUrl: string,
  modelId: string,
  result: ConnectionTestResult
): void {
  const provider = providers.find(item => item.id === providerId && item.companyId === companyId)
  if (!provider) throw new Error('Provider is not available in this company.')
  // Unsaved endpoint edits must not overwrite the saved configuration's diagnostic.
  if (provider.baseUrl.trim() !== baseUrl.trim()) return
  const checkedAt = new Date().toISOString()
  provider.lastTestedAt = checkedAt
  provider.lastConnectionTest = { ok: result.ok, message: result.message, modelId: modelId.trim(), checkedAt }
  provider.status = !provider.enabled ? 'disabled' : result.ok ? 'connected' : 'error'
  logProvider(provider, `Live model test (${modelId.trim()}): ${result.message}`, result.ok ? 'success' : 'error', checkedAt)
}

export async function fetchProviderModels(
  providerId: string,
  companyId: string,
): Promise<{
  items: AiModel[]
  capabilityErrors: string[]
}> {
  ensureCompany(companyId)

  const result = await listStoredModels(companyId, providerId)
  const items = result.items.map(toAiModel)

  // 只替换当前 Provider 的缓存。
  models = [
    ...models.filter(model => model.providerId !== providerId),
    ...items,
  ]

  recalcProviderCount(providerId)

  return {
    items: items.map(cloneModel),
    capabilityErrors: items
      .filter(model => model.capabilityError)
      .map(model => `${model.modelId}：${model.capabilityError}`),
  }
}

export async function refreshModelCapabilities(
  _companyId: string,
  _providerId: string,
  _id: string,
): Promise<AiModel> {
  throw new Error('单模型能力刷新尚未接入数据库，请使用模型同步功能。')
}

export async function createModel(
  _payload: SaveModelPayload,
): Promise<AiModel> {
  throw new Error('模型手动新增尚未接入数据库，请先使用同步功能。')
}

export async function updateModel(
  _modelId: string,
  _payload: SaveModelPayload,
): Promise<AiModel> {
  throw new Error('模型编辑尚未接入数据库，暂时无法保存。')
}

export async function setModelEnabled(
  modelConfigId: string,
  enabled: boolean,
  companyId: string,
  providerId: string,
  expectedVersion: number,
): Promise<AiModel> {
  ensureCompany(companyId)

  const provider = providers.find(
    item =>
      item.id === providerId &&
      item.companyId === companyId,
  )

  if (!provider) {
    throw new Error('当前公司中未找到该 Provider，请刷新列表。')
  }

  const existing = models.find(
    item =>
      item.id === modelConfigId &&
      item.providerId === providerId,
  )

  if (!existing) {
    throw new Error('当前 Provider 中未找到模型，请刷新列表。')
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new Error('模型版本号无效，请刷新列表。')
  }

  const summary = await setStoredModelEnabled(
    companyId,
    providerId,
    modelConfigId,
    enabled,
    expectedVersion,
  )

  if (
    summary.id !== modelConfigId ||
    summary.companyId !== companyId ||
    summary.providerId !== providerId ||
    summary.status !== (enabled ? 'enabled' : 'disabled') ||
    summary.version !== expectedVersion + 1
  ) {
    throw new Error('后端返回的模型状态不一致，请刷新列表确认。')
  }

  const updated = toAiModel(summary)

  models = models.map(model =>
    model.id === modelConfigId && model.providerId === providerId
      ? updated
      : model,
  )

  return cloneModel(updated)
}

export function resolveExecutableModel(
  companyId: string,
  providerId: string,
  id: string
): {
  provider: AiProvider
  model: AiModel
} {
  ensureCompany(companyId)

  const provider = providers.find(
    item =>
      item.id === providerId &&
      item.companyId === companyId
  )

  if (!provider) {
    throw new Error('当前公司下未找到这个 Provider。')
  }

  if (!provider.enabled) {
    throw new Error('这个 Provider 已停用，无法调用模型。')
  }

  const model = models.find(
    item =>
      item.id === id &&
      item.providerId === provider.id
  )

  if (!model) {
    throw new Error('这个 Provider 下未找到模型。')
  }

  if (model.status !== 'enabled') {
    throw new Error('这个模型未启用，无法执行。')
  }

  return {
    provider: cloneProvider(provider),
    model: cloneModel(model),
  }
}

export async function fetchAssistantModelOptions(
  companyId: string,
): Promise<AssistantModelOption[]> {
  ensureCompany(companyId)

  // 先从数据库读取当前公司的 Provider。
  const providerResult = await fetchProviders(companyId)

  const availableProviders = providerResult.items.filter(
    provider =>
      provider.companyId === companyId &&
      provider.enabled &&
      provider.apiKeyMasked.length > 0 &&
      provider.baseUrl.trim() === 'https://openrouter.ai/api/v1',
  )

  // 并行读取每个可用 Provider 在数据库中保存的模型。
  const groups = await Promise.all(
    availableProviders.map(async provider => {
      const result = await fetchProviderModels(
        provider.id,
        companyId,
      )

      return result.items
        .filter(
          model =>
            model.providerId === provider.id &&
            model.status === 'enabled' &&
            (model.type === 'chat' || model.type === 'reasoning') &&
            model.capabilities?.chat === true,
        )
        .map(model => ({
          id: model.id,
          providerId: provider.id,
          modelId: model.modelId,
          label: `${model.name} (${provider.name})`,
        }))
    }),
  )

  return groups
    .flat()
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function deleteModel(
  _modelId: string,
): Promise<void> {
  throw new Error('模型删除尚未接入数据库，暂时无法删除。')
}

export async function deleteProviders(
  companyId: string,
  ids: string[],
): Promise<void> {
  ensureCompany(companyId)
  if (!ids.length || ids.length > 100) throw new Error('请选择 1 到 100 个 Provider。')
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) throw new Error('不能重复选择同一个 Provider。')
  const selected = providers.filter(provider => provider.companyId === companyId && uniqueIds.has(provider.id))
  if (selected.length !== ids.length) throw new Error('选择的 Provider 已改变，请刷新列表后重试。')
  if (selected.some(provider => provider.enabled)) throw new Error('请先停用所有选中的 Provider。')
  if (models.some(model => uniqueIds.has(model.providerId) && model.usedByAgents > 0)) {
    throw new Error('请先解除选中 Provider 下模型与 Agent 的关联。')
  }

  const result = await deleteStoredProviders(companyId, selected.map(provider => ({ id: provider.id, version: provider.version })))
  // 请求成功后使旧列表失效，即使响应数量异常也不能让旧响应恢复记录。
  advanceProviderCache(companyId)
  if (result.deleted !== selected.length) throw new Error('后端返回的删除数量不一致，请刷新列表确认。')
  providers = providers.filter(provider => provider.companyId !== companyId || !uniqueIds.has(provider.id))
  models = models.filter(model => !uniqueIds.has(model.providerId))
}

export async function deleteProvider(
  providerId: string,
  companyId: string,
): Promise<void> {
  ensureCompany(companyId)

  const existing = providers.find(
    provider =>
      provider.id === providerId &&
      provider.companyId === companyId,
  )

  if (!existing) {
    throw new Error('当前公司中未找到该 Provider，请刷新列表。')
  }

  if (existing.enabled) {
    throw new Error('请先停用 Provider，再删除。')
  }

  const hasUsedModels = models.some(
    model =>
      model.providerId === providerId &&
      model.usedByAgents > 0,
  )

  if (hasUsedModels) {
    throw new Error('请先解除该 Provider 下模型与 Agent 的关联。')
  }

  await deleteStoredProvider(
    companyId,
    providerId,
    existing.version,
  )

  // 只有后端删除成功后，才清理本地缓存。
  advanceProviderCache(companyId)
  providers = providers.filter(
    provider =>
      provider.id !== providerId ||
      provider.companyId !== companyId,
  )

  models = models.filter(
    model => model.providerId !== providerId,
  )
}

export async function deleteModels(
  _providerId: string,
  _ids: string[],
): Promise<void> {
  throw new Error('模型批量删除尚未接入数据库，暂时无法删除。')
}

export async function syncProviderModels(
  companyId: string,
  providerId: string,
): Promise<ModelSyncResult> {
  ensureCompany(companyId)

  const result = await syncStoredProviderModels(
    companyId,
    providerId,
  )

  try {
    await fetchProviderModels(providerId, companyId)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '未知错误'

    throw new Error(
      `数据库同步已完成，但重新加载列表失败，请刷新页面确认：${detail}`,
    )
  }

  return result
}
