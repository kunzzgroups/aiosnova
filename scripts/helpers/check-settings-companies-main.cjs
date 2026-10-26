// Keep SQL-backed catalogs separate from local Tools/MCP/Usage sample fixtures.
const assert = require('node:assert/strict')
module.exports = async function ({ load, clean, api }) {
  const settings = load('src/modules/ai/settings/services/settingsService.ts')
  const tools = load('src/modules/ai/settings/services/toolsService.ts')
  const mcp = load('src/modules/ai/settings/services/mcpService.ts')
  const security = load('src/modules/ai/settings/services/securityService.ts')
  const usage = load('src/modules/ai/settings/services/usageService.ts')
  const fixtures = load('src/modules/ai/settings/services/companyFixtures.ts')
  const companies = ['company-retail', 'company-wholesale', 'company-j1', 'company-j2', 'company-tokyo-izakaya']
  async function snapshot(companyId) {
    const catalog = await settings.fetchCompanyModels(companyId)
    return clean({ providers: (await settings.fetchProviders(companyId)).items, models: catalog.items, summary: await settings.fetchSettingsSummary(companyId),
      runtime: await settings.fetchRuntimeDefaults(companyId), tools: await tools.fetchTools(companyId), mcp: await mcp.fetchMcpServers(companyId),
      security: await security.fetchSecurityPolicy(companyId), usage: await usage.fetchUsageRecords(companyId) })
  }
  const initial = await Promise.all(companies.map(snapshot)), allIds = new Set()
  for (const [index, companyId] of companies.entries()) {
    const data = initial[index], fixture = fixtures.companyFixture(companyId)
    assert.equal(data.providers.length, [...api.providers.values()].filter(row => row.companyId === companyId).length)
    assert.equal(data.models.length, [...api.models.values()].filter(row => row.companyId === companyId).length)
    assert.equal(data.tools.length, fixture.tools.length)
    assert.equal(data.mcp.length, fixture.mcp.length)
    assert.equal(data.summary.providers, data.providers.length)
    assert.equal(data.summary.models, data.models.length)
    assert.equal(data.summary.enabledModels, data.models.filter(row => row.status === 'enabled').length)
    assert.equal(data.summary.connectedProviders, data.providers.filter(row => row.status === 'connected').length)
    for (const item of [...data.providers, ...data.tools, ...data.mcp]) assert.equal(item.companyId, companyId)
    for (const item of [...data.providers, ...data.models, ...data.tools, ...data.mcp]) {
      assert(!allIds.has(item.id), 'Configuration/resource IDs must be unique across companies')
      allIds.add(item.id)
    }
    // Same external model ID across tenants is valid; configuration UUIDs must differ.
    assert(data.models.every(row => row.modelId === 'test/shared-model'))
    for (const provider of data.providers) assert.equal(provider.modelCount, data.models.filter(row => row.providerId === provider.id).length)
    assert.equal(Object.keys(security.validateSecurityPolicy(data.security.policy)).length, 0)
    assert.equal(data.security.policy.monthly, fixture.security.monthly)
    const defaultId = api.preferences.get(companyId).defaultModelConfigId
    assert.equal(data.runtime.model, data.models.find(row => row.id === defaultId).name)
    assert.equal(data.runtime.fallbackModel, 'Not configured')
    const agents = load('src/modules/ai/mock/seed.ts').SEED_AGENTS.filter(row => row.companyId === companyId)
    for (const resource of [...data.tools, ...data.mcp]) assert(resource.agents.every(name => agents.some(row => row.name === name)))
    // Usage remains sample data; do not claim it comes from SQL model executions.
    assert(data.usage.every(row => data.tools.some(tool => tool.name === row.tool) && data.mcp.some(server => server.name === row.mcp)))
    for (const days of [7, 30, 60]) {
      const current = usage.usagePeriod(data.usage, days), previous = usage.usagePeriod(data.usage, days, true)
      assert.equal(usage.usageDaily(current).length, days)
      assert.equal(usage.usageDaily(previous).length, days)
      const previousDates = new Set(previous.map(row => row.date))
      assert(current.every(row => !previousDates.has(row.date)))
      const totals = usage.usageTotals(current)
      for (const group of ['model', 'agent', 'user', 'tool', 'mcp']) {
        const grouped = usage.usageTotals(usage.usageBreakdown(current, group))
        for (const key of Object.keys(totals)) assert(Math.abs(totals[key] - grouped[key]) < 1e-6)
      }
      assert(Math.abs(usage.usageTotals(usage.usageDaily(current)).cost - totals.cost) < 1e-6)
    }
    const returned = await mcp.fetchMcpServers(companyId)
    returned[0].capabilities[0].enabled = !returned[0].capabilities[0].enabled
    assert.deepEqual(clean(await mcp.fetchMcpServers(companyId)), data.mcp)
  }
  assert.equal(new Set(initial.map(data => data.security.policy.monthly)).size, companies.length)
  assert.equal(new Set(initial.map(data => usage.usageTotals(usage.usagePeriod(data.usage, 30)).requests)).size, companies.length)
  const a = companies[0], b = companies[1], beforeB = initial[1], provider = initial[0].providers[0]
  await settings.updateProvider(provider.id, { companyId: a, name: 'Retail Edited Provider', baseUrl: provider.baseUrl, enabled: true }, provider.version)
  await assert.rejects(() => settings.updateProvider(provider.id, { companyId: b, name: 'Wrong company', baseUrl: provider.baseUrl, enabled: true }))
  const created = await settings.createModel({ providerId: provider.id, name: 'Retail Only Model', modelId: 'test/retail-only', type: 'chat', contextWindow: 32000, enabled: false }, a)
  assert.equal(created.status, 'disabled')
  await assert.rejects(() => settings.updateModel(created.id, { providerId: beforeB.providers[0].id, name: 'Cross company', modelId: created.modelId, type: 'chat', contextWindow: 32000, enabled: false }, a, created.version))
  const tool = initial[0].tools.find(row => row.status === 'active')
  await tools.setToolEnabled(a, tool.id, false)
  await assert.rejects(() => tools.setToolEnabled(b, tool.id, false))
  await mcp.toggleMcpServer(a, initial[0].mcp[0].id)
  await assert.rejects(() => mcp.toggleMcpServer(b, initial[0].mcp[0].id))
  const oldPolicy = await security.fetchSecurityPolicy(a), policy = { ...oldPolicy.policy, monthly: oldPolicy.policy.monthly + 1000 }
  await security.saveSecurityPolicy(a, policy, oldPolicy.revision, 'Test Admin')
  await assert.rejects(() => security.saveSecurityPolicy(a, policy, oldPolicy.revision, 'Stale Admin'))
  const updated = await snapshot(a)
  assert(updated.models.some(row => row.id === created.id))
  assert.equal(updated.runtime.provider, 'Retail Edited Provider')
  assert.equal(updated.security.policy.monthly, policy.monthly)
  assert(updated.security.changes.some(row => row.actor === 'Test Admin'))
  const noOp = await security.saveSecurityPolicy(a, policy, updated.security.revision, 'No-op Admin')
  assert.equal(noOp.revision, updated.security.revision)
  assert.equal(noOp.changes.length, updated.security.changes.length)
  for (const [patch, field] of [[{ steps: 1.5 }, 'steps'], [{ timeout: 0 }, 'timeout'], [{ daily: 500, monthly: 100 }, 'monthly'], [{ daily: NaN }, 'daily'], [{ daily: 1.234 }, 'daily']])
    assert(security.validateSecurityPolicy({ ...policy, ...patch })[field])
  noOp.policy.monthly = 1
  assert.equal((await security.fetchSecurityPolicy(a)).policy.monthly, policy.monthly)
  const budget = usage.budgetUsage(updated.usage, policy.monthly), month = usage.usageToday().slice(0, 7)
  assert(Math.abs(budget.remaining - (policy.monthly - budget.spent)) < 1e-6)
  assert(Math.abs(budget.spent - usage.usageTotals(updated.usage.filter(row => row.date.startsWith(month))).cost) < 1e-6)
  assert.equal(usage.budgetUsage(updated.usage, policy.monthly * 2).used, budget.used / 2)
  assert.deepEqual(await snapshot(b), beforeB)
  await settings.deleteModel(created.id, a, provider.id, created.version)
  assert(!(await snapshot(a)).models.some(row => row.id === created.id))
  const disposable = await settings.createModel({ providerId: provider.id, name: 'Disposable', modelId: 'test/disposable', type: 'chat', contextWindow: 0, enabled: false }, a)
  const targets = [{ id: disposable.id, version: disposable.version }]
  await assert.rejects(() => settings.deleteModels(a, beforeB.providers[0].id, targets))
  await assert.rejects(() => settings.deleteModels(b, provider.id, targets))
  await assert.rejects(() => settings.deleteModels(a, provider.id, [{ ...targets[0], version: disposable.version + 1 }]), /conflict/)
  assert((await settings.fetchProviderModels(provider.id, a)).items.some(row => row.id === disposable.id))
  await settings.deleteModels(a, provider.id, targets)
  assert(!(await snapshot(a)).models.some(row => row.id === disposable.id))
  let runtimeModel = updated.models.find(row => row.id === api.preferences.get(a).defaultModelConfigId)
  runtimeModel = await settings.setModelEnabled(runtimeModel.id, false, a, provider.id, runtimeModel.version)
  assert.equal((await settings.fetchRuntimeDefaults(a)).model, 'Not configured')
  runtimeModel = await settings.setModelEnabled(runtimeModel.id, true, a, provider.id, runtimeModel.version)
  assert.equal((await settings.fetchRuntimeDefaults(a)).model, runtimeModel.name)
  const clonedProviders = (await settings.fetchProviders(a)).items
  clonedProviders[0].name = 'Mutated caller clone'
  assert.notEqual((await settings.fetchProvider(clonedProviders[0].id)).name, 'Mutated caller clone')
  const disabledTool = initial[0].tools.find(row => row.status === 'disabled')
  await assert.rejects(() => tools.deleteTools(b, [disabledTool.id]))
  await tools.deleteTools(a, [disabledTool.id])
  assert(!(await tools.fetchTools(a)).some(row => row.id === disabledTool.id))
  const disabledMcp = initial[0].mcp.find(row => row.status === 'disabled')
  await assert.rejects(() => mcp.removeMcpServers(b, [disabledMcp.id]))
  await mcp.removeMcpServers(a, [disabledMcp.id])
  assert(!(await mcp.fetchMcpServers(a)).some(row => row.id === disabledMcp.id))
  assert.deepEqual(await snapshot(b), beforeB)
  const empty = 'company-isolation-empty'
  assert.equal((await settings.fetchProviders(empty)).items.length, 0)
  const transient = await settings.createProvider({ companyId: empty, name: 'Temporary', baseUrl: api.officialUrl, enabled: false })
  await settings.deleteProvider(transient.id, empty)
  assert.equal((await settings.fetchProviders(empty)).items.length, 0)
  assert.equal((await settings.fetchSettingsSummary(empty)).models, 0)
  assert.equal((await settings.fetchRuntimeDefaults(empty)).model, 'Not configured')
  for (const read of [settings.fetchProviders, tools.fetchTools, mcp.fetchMcpServers, security.fetchSecurityPolicy, usage.fetchUsageRecords]) await assert.rejects(() => read(''))
  console.log('PASS: five-company API catalogs, UUID/account isolation, database preferences, summaries, scoped CRUD, default disable/re-enable and empty results; local Tools/MCP/Usage/policy validation. Simulated HTTP only.')
}
