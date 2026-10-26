// In-memory HTTP fixtures for frontend contract tests. Never connects to a server.
// Server validation/transactions are covered separately by Java checks.
const { createHash, randomUUID } = require('node:crypto')
const officialUrl = 'https://openrouter.ai/api/v1'
const timestamp = '2026-10-26T08:00:00Z'
const uuid = text => {
  const hex = createHash('sha256').update(text).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
function createSettingsApi() {
  const providers = new Map(), models = new Map(), preferences = new Map(), calls = []
  const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) })
  const error = (status, message) => reply({ message }, status)
  const verification = (status = 'not_verified') => ({
    connectionRevision: 0, verificationStatus: status,
    verificationRevision: status === 'not_verified' ? null : 0,
    verificationModelId: status === 'not_verified' ? null : 'test/shared-model',
    verificationCheckedAt: status === 'not_verified' ? null : timestamp,
    verificationLastSuccessAt: status === 'verified' ? timestamp : null,
    verificationErrorCode: status === 'failed' ? 'authentication_failed' : null,
    verificationErrorMessage: status === 'failed' ? 'Authentication failed. Check the OpenRouter API Key.' : null,
  })
  function seed(companyId) {
    if (preferences.has(companyId)) return
    for (const [index, state] of ['verified', 'failed', 'not_verified'].entries()) {
      const id = uuid(`${companyId}/provider/${index}`)
      providers.set(id, { id, companyId, name: `${companyId} Provider ${index}`, providerType: 'openrouter', baseUrl: officialUrl,
        enabled: index !== 2, hasApiKey: true, version: 0, ...verification(state) })
      const modelId = uuid(`${companyId}/model/${index}`)
      models.set(modelId, { id: modelId, companyId, providerId: id, modelId: 'test/shared-model', name: `${companyId} Model ${index}`,
        type: 'chat', status: index === 0 ? 'enabled' : 'disabled', description: '', contextWindow: 128000,
        configuredContextWindow: null, catalogContextWindow: 128000,
        capabilities: { chat: true, vision: false, toolCalling: false, contextWindow: 128000 },
        capabilitiesCheckedAt: timestamp, capabilityError: null, version: 0 })
    }
    preferences.set(companyId, { companyId, defaultModelConfigId: uuid(`${companyId}/model/0`), recommendedModelConfigIds: [], version: 0, storageReady: true })
  }
  function invalidate(row) {
    const lastSuccess = row.verificationLastSuccessAt
    const revision = row.connectionRevision + 1
    Object.assign(row, verification(), { connectionRevision: revision, verificationLastSuccessAt: lastSuccess })
  }
  async function fetch(input, options = {}) {
    // Reject absolute URLs: a missing route must never fall through to real fetch.
    if (!String(input).startsWith('/api/ai/')) throw new Error(`Unexpected test URL: ${input}`)
    const url = new URL(input, 'http://fixture.invalid'), method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ path: url.pathname, method, body: structuredClone(body), query: url.search })
    const companyId = body?.companyId ?? url.searchParams.get('companyId')
    if (!companyId?.trim() && url.pathname !== '/api/ai/test-connection') return error(400, 'Company is required.')
    if (url.pathname === '/api/ai/test-connection' && method === 'POST') {
      return reply({ ok: false, message: body.baseUrl !== officialUrl
        ? 'Connection tests currently support https://openrouter.ai/api/v1 only.'
        : 'The fixture does not execute real draft model requests.' })
    }
    if (url.pathname === '/api/ai/providers' && method === 'GET')
      return reply({ items: [...providers.values()].filter(row => row.companyId === companyId) })
    if (url.pathname === '/api/ai/providers' && method === 'POST') {
      if (body.baseUrl !== officialUrl) return error(400, 'Only the official OpenRouter endpoint is supported.')
      const row = { id: randomUUID(), companyId, name: body.name, providerType: 'openrouter', baseUrl: body.baseUrl,
        enabled: body.enabled, hasApiKey: !!body.apiKey, version: 0, ...verification() }
      providers.set(row.id, row); return reply(row, 201)
    }
    const providerRoute = url.pathname.match(/^\/api\/ai\/providers\/([^/]+)(?:\/(enabled|test-connection))?$/)
    if (providerRoute) {
      const row = providers.get(providerRoute[1]), action = providerRoute[2]
      if (!row || row.companyId !== companyId) return error(404, 'Provider not found in this company.')
      const version = body?.version ?? Number(url.searchParams.get('version'))
      if (version !== row.version) return error(409, 'Version conflict')
      if (method === 'PUT' && !action) {
        if (body.baseUrl !== officialUrl) return error(400, 'Only the official OpenRouter endpoint is supported.')
        if (body.baseUrl !== row.baseUrl || body.apiKey?.trim()) invalidate(row)
        Object.assign(row, { name: body.name, baseUrl: body.baseUrl, enabled: body.enabled, hasApiKey: row.hasApiKey || !!body.apiKey, version: row.version + 1 })
        return reply(row)
      }
      if (method === 'PATCH' && action === 'enabled') {
        row.enabled = body.enabled; row.version++; return reply(row)
      }
      if (method === 'POST' && action === 'test-connection') {
        if (!row.enabled) return error(409, 'Enable the Provider first.')
        if (!row.hasApiKey) return error(409, 'Save the Provider API Key first.')
        const ok = body.modelId === 'test/shared-model'
        const historical = row.verificationLastSuccessAt
        const revision = row.connectionRevision
        Object.assign(row, verification(ok ? 'verified' : 'failed'), { connectionRevision: revision, verificationRevision: revision,
          verificationModelId: body.modelId, verificationLastSuccessAt: ok ? timestamp : historical, version: row.version + 2 })
        return reply({ ok, message: ok ? 'Model connection successful.' : row.verificationErrorMessage, reply: ok ? 'OK' : '',
          providerVersion: row.version, connectionRevision: row.connectionRevision, verificationStatus: row.verificationStatus })
      }
      if (method === 'DELETE' && !action) {
        if (row.enabled) return error(409, 'Disable the Provider first.')
        providers.delete(row.id)
        for (const model of models.values()) if (model.providerId === row.id) models.delete(model.id)
        return reply({}, 204)
      }
    }
    if (url.pathname === '/api/ai/model-preferences' && method === 'GET') {
      return reply(preferences.get(companyId) ?? { companyId, defaultModelConfigId: null, recommendedModelConfigIds: [], version: 0, storageReady: true })
    }
    if (url.pathname === '/api/ai/models' && method === 'GET') {
      const providerId = url.searchParams.get('providerId'), parent = providers.get(providerId)
      if (!parent || parent.companyId !== companyId) return error(404, 'Provider not found in this company.')
      const items = [...models.values()].filter(row => row.companyId === companyId && row.providerId === providerId)
      return reply({ items, count: items.length })
    }
    if (url.pathname === '/api/ai/models' && method === 'POST') {
      const parent = providers.get(body.providerId)
      if (!parent || parent.companyId !== companyId) return error(404, 'Provider not found in this company.')
      const row = { id: randomUUID(), ...body, status: 'disabled', contextWindow: body.contextWindow,
        configuredContextWindow: body.contextWindow, catalogContextWindow: null, capabilities: null, capabilitiesCheckedAt: null,
        capabilityError: 'Model capabilities unknown', version: 0 }
      models.set(row.id, row); return reply(row, 201)
    }
    if (url.pathname === '/api/ai/models/bulk-delete' && method === 'POST') {
      const targets = body.items.map(item => models.get(item.id))
      if (targets.some((row, index) => !row || row.companyId !== companyId || row.providerId !== body.providerId || row.status !== 'disabled' || row.version !== body.items[index].version))
        return error(409, 'Model scope, state or version conflict')
      targets.forEach(row => models.delete(row.id))
      return reply({ deleted: targets.length })
    }
    const modelRoute = url.pathname.match(/^\/api\/ai\/models\/([^/]+)(?:\/(enabled))?$/)
    if (modelRoute) {
      const row = models.get(modelRoute[1])
      const providerId = body?.providerId ?? url.searchParams.get('providerId')
      if (!row || row.companyId !== companyId || row.providerId !== providerId) return error(404, 'Model not found under this Provider.')
      if ((body?.version ?? Number(url.searchParams.get('version'))) !== row.version) return error(409, 'Version conflict')
      if (method === 'PATCH' && modelRoute[2] === 'enabled') {
        if (body.enabled && !row.capabilities) return error(409, 'Model capabilities are unknown.')
        row.status = body.enabled ? 'enabled' : 'disabled'; row.version++; return reply(row)
      }
      if (method === 'DELETE') {
        if (row.status !== 'disabled') return error(409, 'Disable the model first.')
        models.delete(row.id); return reply({}, 204)
      }
    }
    throw new Error(`Unhandled fixture request: ${method} ${url.pathname}`)
  }
  return { seed, fetch, calls, providers, models, preferences, officialUrl }
}
module.exports = { createSettingsApi }
