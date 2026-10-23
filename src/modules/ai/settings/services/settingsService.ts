import type {
  AiModel,
  AiProvider,
  AiSettingsSummary,
  SaveModelPayload,
  SaveProviderPayload,
} from '../types/settings'
import type { ConnectionTestResult } from './connectionService'
import { fetchModelPreferences } from './modelPreferencesService'
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
  setStoredModelsEnabled,
  updateStoredModel,
  deleteStoredModel,
  deleteStoredModels,
  createStoredModel,
  refreshStoredModelCapabilities,
  type DeleteStoredModelTarget,
  type StoredModelSummary,
} from './modelApiService'

// Provider 和模型列表来自数据库。
// providers、models 只作为运行时缓存。

export type AssistantModelOption = {
  id: string
  providerId: string
  modelId: string
  name: string
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
  const [preferences, options] = await Promise.all([fetchModelPreferences(companyId), fetchAssistantModelOptions(companyId)])
  const model = options.find(option => option.id === preferences.defaultModelConfigId)
  return {
    provider: model ? providers.find(provider => provider.id === model.providerId)?.name ?? 'Unavailable' : 'Not configured',
    model: model?.name ?? 'Not configured',
    fallbackModel: 'Not configured',
    routing: model ? 'Company default model' : preferences.defaultModelConfigId ? 'Company default unavailable' : 'Not configured',
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
      (summary.capabilityError && /[\u3400-\u9fff]/.test(summary.capabilityError)
        ? 'Stored capability metadata is incomplete. Refresh capabilities for details.'
        : summary.capabilityError) ??
      (summary.capabilities ? undefined : 'Model capabilities unknown'),
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
    throw new Error('The returned Provider belongs to another company.')
  }

  if ((providerCacheVersions.get(companyId) ?? 0) !== requestVersion) {
    return { items: providers.filter(provider => provider.companyId === companyId).map(cloneProvider) }
  }

  const items = summaries.map(toAiProvider)

  // Replace this company's cache while preserving other companies.
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
    throw new Error('The created record belongs to another company. Reload to confirm.')
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
    throw new Error('Provider not found in this company. Reload the list.')
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
    throw new Error('Provider response did not match. Reload to confirm.')
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
    throw new Error('Provider not found in this company. Reload the list.')
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
    throw new Error('Provider response did not match. Reload to confirm.')
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
  companyId: string,
  providerId: string,
  modelConfigId: string,
  expectedVersion: number,
): Promise<AiModel> {
  ensureCompany(companyId)

  const provider = providers.find(item =>
    item.id === providerId &&
    item.companyId === companyId
  )

  if (!provider) {
    throw new Error('Provider not found in this company.')
  }

  const existing = models.find(item =>
    item.id === modelConfigId &&
    item.providerId === providerId
  )

  if (!existing) {
    throw new Error('Model not found under this Provider. Reload the list.')
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new Error('Invalid model version. Reload the list.')
  }

  const summary = await refreshStoredModelCapabilities(
    companyId,
    providerId,
    modelConfigId,
    expectedVersion,
  )

  if (
    summary.modelId !== existing.modelId ||
    summary.name !== existing.name ||
    summary.status !== existing.status ||
    !summary.capabilitiesCheckedAt
  ) {
    throw new Error('Invalid capability refresh response. Reload the model list to confirm.')
  }

  const updated = toAiModel(summary)

  models = models.map(item =>
    item.id === modelConfigId &&
      item.providerId === providerId
      ? updated
      : item
  )

  return cloneModel(updated)
}

export async function createModel(
  payload: SaveModelPayload,
  companyId: string,
): Promise<AiModel> {
  ensureCompany(companyId)

  const provider = providers.find(item =>
    item.id === payload.providerId &&
    item.companyId === companyId
  )

  if (!provider) {
    throw new Error('Provider not found in this company. Reload the list.')
  }

  const name = payload.name.trim()
  const modelId = payload.modelId.trim()

  if (!name || !modelId) {
    throw new Error('Enter a model name and model ID.')
  }

  if (
    !Number.isSafeInteger(payload.contextWindow) ||
    payload.contextWindow < 0 ||
    payload.contextWindow > 2147483647
  ) {
    throw new Error(
      'Context window must be an integer from 0 to 2147483647; 0 means unknown.',
    )
  }

  const summary = await createStoredModel({
    companyId,
    providerId: provider.id,
    modelId,
    name,
    type: payload.type,
    description: payload.description?.trim() ?? '',
    contextWindow:
      payload.contextWindow === 0 ? null : payload.contextWindow,
  })

  const created = toAiModel(summary)

  models = [
    ...models.filter(item =>
      !(item.id === created.id && item.providerId === created.providerId)
    ),
    created,
  ]

  recalcProviderCount(provider.id)

  return cloneModel(created)
}

export async function updateModel(
  modelConfigId: string,
  payload: SaveModelPayload,
  companyId: string,
  expectedVersion: number,
): Promise<AiModel> {
  ensureCompany(companyId)

  const provider = providers.find(item =>
    item.id === payload.providerId &&
    item.companyId === companyId
  )

  if (!provider) {
    throw new Error('Provider not found in this company. Reload the list.')
  }

  const existing = models.find(item =>
    item.id === modelConfigId &&
    item.providerId === payload.providerId
  )

  if (!existing) {
    throw new Error('Model not found under this Provider. Reload the list.')
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new Error('Invalid model version. Close the form and reload.')
  }

  if (payload.modelId.trim() !== existing.modelId) {
    throw new Error('The external model ID cannot be changed when editing.')
  }

  if (
    !Number.isSafeInteger(payload.contextWindow) ||
    payload.contextWindow < 0 ||
    payload.contextWindow > 2147483647
  ) {
    throw new Error('Context window must be an integer from 0 to 2147483647; 0 means unknown.')
  }

  const summary = await updateStoredModel(modelConfigId, {
    companyId,
    providerId: payload.providerId,
    name: payload.name.trim(),
    type: payload.type,
    enabled: payload.enabled,
    description: payload.description?.trim() ?? '',
    contextWindow:
      payload.contextWindow === 0 ? null : payload.contextWindow,
    version: expectedVersion,
  })

  if (
    summary.modelId !== existing.modelId ||
    summary.status !== (payload.enabled ? 'enabled' : 'disabled')
  ) {
    throw new Error('Model configuration response did not match. Reload to confirm.')
  }

  const updated = toAiModel(summary)

  models = models.map(item =>
    item.id === modelConfigId &&
      item.providerId === payload.providerId
      ? updated
      : item
  )

  return cloneModel(updated)
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
    throw new Error('Provider not found in this company. Reload the list.')
  }

  const existing = models.find(
    item =>
      item.id === modelConfigId &&
      item.providerId === providerId,
  )

  if (!existing) {
    throw new Error('Model not found under this Provider. Reload the list.')
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new Error('Invalid model version. Reload the list.')
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
    throw new Error('Model state response did not match. Reload to confirm.')
  }

  const updated = toAiModel(summary)

  models = models.map(model =>
    model.id === modelConfigId && model.providerId === providerId
      ? updated
      : model,
  )

  return cloneModel(updated)
}

export async function setModelsEnabled(companyId: string, providerId: string, enabled: boolean,
  targets: { id: string; version: number }[]): Promise<void> {
  ensureCompany(companyId)
  if (!providers.some(provider => provider.companyId === companyId && provider.id === providerId)) throw new Error('Provider not found in this company.')
  if (!targets.length || targets.length > 1000 || new Set(targets.map(target => target.id)).size !== targets.length)
    throw new Error('Select between 1 and 1,000 distinct models.')
  await setStoredModelsEnabled(companyId, providerId, enabled, targets)
  await fetchProviderModels(providerId, companyId)
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
    throw new Error('Provider not found in this company.')
  }

  if (!provider.enabled) {
    throw new Error('This Provider is disabled and cannot run models.')
  }

  const model = models.find(
    item =>
      item.id === id &&
      item.providerId === provider.id
  )

  if (!model) {
    throw new Error('Model not found under this Provider.')
  }

  if (model.status !== 'enabled') {
    throw new Error('This model is disabled and cannot run.')
  }

  return {
    provider: cloneProvider(provider),
    model: cloneModel(model),
  }
}

export async function fetchCompanyModels(companyId: string): Promise<{ providers: AiProvider[]; items: AiModel[]; capabilityErrors: string[] }> {
  const result = await fetchProviders(companyId)
  const groups = await Promise.all(result.items.map(async provider => {
    const models = await fetchProviderModels(provider.id, companyId)
    return { ...models, capabilityErrors: models.capabilityErrors.map(message => `${provider.name}: ${message}`) }
  }))
  return { providers: result.items, items: groups.flatMap(group => group.items), capabilityErrors: groups.flatMap(group => group.capabilityErrors) }
}

export function availableCompanyModelOptions(companyProviders: AiProvider[], companyModels: AiModel[]): AssistantModelOption[] {
  const parents = new Map(companyProviders.filter(provider => provider.enabled && provider.apiKeyMasked && provider.baseUrl.trim() === 'https://openrouter.ai/api/v1').map(provider => [provider.id, provider]))
  return companyModels.filter(model => parents.has(model.providerId) && model.status === 'enabled' &&
    (model.type === 'chat' || model.type === 'reasoning') && model.capabilities?.chat === true && model.capabilitiesCheckedAt && !model.capabilityError)
    .map(model => ({ id: model.id, providerId: model.providerId, modelId: model.modelId, name: model.name, label: `${model.name} (${parents.get(model.providerId)!.name})` }))
    .sort((a, b) => a.label.localeCompare(b.label))
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
    }),
  )

  return availableCompanyModelOptions(availableProviders, groups.flat())
}

export async function deleteModel(
  modelConfigId: string,
  companyId: string,
  providerId: string,
  expectedVersion: number,
): Promise<void> {
  ensureCompany(companyId)

  const provider = providers.find(item =>
    item.id === providerId &&
    item.companyId === companyId
  )

  if (!provider) {
    throw new Error('Provider not found in this company. Reload the list.')
  }

  const existing = models.find(item =>
    item.id === modelConfigId &&
    item.providerId === providerId
  )

  if (!existing) {
    throw new Error('Model not found under this Provider. Reload the list.')
  }

  if (existing.status !== 'disabled') {
    throw new Error('Disable the model before deleting it.')
  }

  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    throw new Error('Invalid model version. Close the dialog and reload.')
  }

  await deleteStoredModel(
    companyId,
    providerId,
    modelConfigId,
    expectedVersion,
  )

  // 后端确认删除成功后，才移除本地缓存。
  models = models.filter(item =>
    !(
      item.id === modelConfigId &&
      item.providerId === providerId
    )
  )

  recalcProviderCount(providerId)
}

export async function deleteProviders(
  companyId: string,
  ids: string[],
): Promise<void> {
  ensureCompany(companyId)
  if (!ids.length || ids.length > 100) throw new Error('Select between 1 and 100 Providers.')
  const uniqueIds = new Set(ids)
  if (uniqueIds.size !== ids.length) throw new Error('Do not select the same Provider twice.')
  const selected = providers.filter(provider => provider.companyId === companyId && uniqueIds.has(provider.id))
  if (selected.length !== ids.length) throw new Error('Selected Providers changed. Reload and try again.')
  if (selected.some(provider => provider.enabled)) throw new Error('Disable all selected Providers first.')
  if (models.some(model => uniqueIds.has(model.providerId) && model.usedByAgents > 0)) {
    throw new Error('Unassign Agents from the selected Providers before deleting.')
  }

  const result = await deleteStoredProviders(companyId, selected.map(provider => ({ id: provider.id, version: provider.version })))
  // 请求成功后使旧列表失效，即使响应数量异常也不能让旧响应恢复记录。
  advanceProviderCache(companyId)
  if (result.deleted !== selected.length) throw new Error('Deleted count did not match. Reload to confirm.')
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
    throw new Error('Provider not found in this company. Reload the list.')
  }

  if (existing.enabled) {
    throw new Error('Disable the Provider before deleting it.')
  }

  const hasUsedModels = models.some(
    model =>
      model.providerId === providerId &&
      model.usedByAgents > 0,
  )

  if (hasUsedModels) {
    throw new Error('Unassign Agents from this Provider before deleting.')
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
  companyId: string,
  providerId: string,
  targets: DeleteStoredModelTarget[],
): Promise<void> {
  ensureCompany(companyId)

  if (targets.length < 1 || targets.length > 100) {
    throw new Error('Select between 1 and 100 models.')
  }

  // 复制调用方提供的版本，不能从缓存替换成最新版本。
  const items = targets.map(item => ({
    id: item.id,
    version: item.version,
  }))

  const ids = new Set(items.map(item => item.id))

  if (ids.size !== items.length) {
    throw new Error('Do not select the same model twice.')
  }

  if (items.some(item =>
    !item.id.trim() ||
    !Number.isSafeInteger(item.version) ||
    item.version < 0
  )) {
    throw new Error('Invalid model ID or version. Select the models again.')
  }

  const provider = providers.find(item =>
    item.id === providerId &&
    item.companyId === companyId
  )

  if (!provider) {
    throw new Error('Provider not found in this company.')
  }

  const selected = models.filter(item =>
    item.providerId === providerId &&
    ids.has(item.id)
  )

  if (selected.length !== items.length) {
    throw new Error('Some models no longer exist. Reload and select again.')
  }

  if (selected.some(item => item.status !== 'disabled')) {
    throw new Error('Disable all selected models first.')
  }

  await deleteStoredModels(companyId, providerId, items)

  // 整批请求成功后，才移除缓存。
  models = models.filter(item =>
    item.providerId !== providerId || !ids.has(item.id)
  )

  recalcProviderCount(providerId)
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
    const detail = error instanceof Error ? error.message : 'Unknown error'

    throw new Error(
      `Database sync completed, but reloading failed. Refresh to confirm: ${detail}`,
    )
  }

  return result
}
