// Headless service checks. No browser, screenshots, or application seed writes.
// Run: node scripts/check-settings-companies.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const modules = new Map()
const context = vm.createContext({
  console, structuredClone, URL, Intl, Date, crypto: require('node:crypto').webcrypto,
  window: {setTimeout: callback => setTimeout(callback, 0)},
})
function load(file) {
  if(file.endsWith('.css'))return {}
  let filename = path.resolve(root, file)
  if(!/\.tsx?$/.test(filename))filename=fs.existsSync(filename+'.ts')?filename+'.ts':filename+'.tsx'
  if (modules.has(filename)) return modules.get(filename).exports
  const module = {exports: {}}
  modules.set(filename, module)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText
  function localRequire(request) {
    if(!request.startsWith('.')&&!request.startsWith('@/'))return require(request)
    if (request === '@/modules/ai/agents/services/agentService') {
      // Assignment validation uses the real existing agent seeds, without auth/UI dependencies.
      return {fetchAgents: async companyId => ({items: load('src/modules/ai/mock/seed.ts').SEED_AGENTS.filter(agent => agent.companyId === companyId)})}
    }
    return load(request.startsWith('@/') ? 'src/' + request.slice(2) : path.resolve(path.dirname(filename), request))
  }
  const factory = vm.runInContext('(function(require,module,exports){' + source + '\n})', context, {filename})
  factory(localRequire, module, module.exports)
  return module.exports
}
const clean = value => JSON.parse(JSON.stringify(value))
const settings = load('src/modules/ai/settings/services/settingsService.ts')
const tools = load('src/modules/ai/settings/services/toolsService.ts')
const mcp = load('src/modules/ai/settings/services/mcpService.ts')
const security = load('src/modules/ai/settings/services/securityService.ts')
const usage = load('src/modules/ai/settings/services/usageService.ts')
const fixtures = load('src/modules/ai/settings/services/companyFixtures.ts')
const companies = ['company-retail','company-wholesale','company-j1','company-j2','company-tokyo-izakaya']
async function snapshot(companyId) {
  const providers = (await settings.fetchProviders(companyId)).items
  const models = (await Promise.all(providers.map(provider => settings.fetchProviderModels(provider.id)))).flatMap(result => result.items)
  return clean({providers, models, summary:await settings.fetchSettingsSummary(companyId), tools:await tools.fetchTools(companyId),
    mcp:await mcp.fetchMcpServers(companyId), security:await security.fetchSecurityPolicy(companyId),
    runtime:await settings.fetchRuntimeDefaults(companyId), usage:await usage.fetchUsageRecords(companyId)})
}
async function main() {
  const initial = await Promise.all(companies.map(snapshot))
  const allIds = new Set()
  for (let i=0;i<companies.length;i++) {
    const companyId=companies[i],data=initial[i],fixture=fixtures.companyFixture(companyId)
    assert.equal(data.providers.length,Object.keys(fixture.providers).length)
    assert.equal(data.tools.length,fixture.tools.length)
    assert.equal(data.mcp.length,fixture.mcp.length)
    assert.equal(data.summary.providers,data.providers.length)
    assert.equal(data.summary.models,data.models.length)
    assert.equal(data.summary.enabledModels,data.models.filter(model=>model.status==='enabled').length)
    assert.equal(data.summary.connectedProviders,data.providers.filter(provider=>provider.status==='connected').length)
    for(const item of [...data.providers,...data.tools,...data.mcp]) assert.equal(item.companyId,companyId)
    for(const item of [...data.providers,...data.models,...data.tools,...data.mcp]) {
      assert(!allIds.has(item.id),'IDs must be unique across companies and resource types')
      allIds.add(item.id)
    }
    for(const provider of data.providers) {
      const models=data.models.filter(model=>model.providerId===provider.id)
      assert.equal(provider.modelCount,models.length)
      if(provider.status==='disabled')assert(models.every(model=>model.status==='disabled'))
    }
    assert.equal(Object.keys(security.validateSecurityPolicy(data.security.policy)).length,0)
    assert.equal(data.security.policy.monthly,fixture.security.monthly)
    const configured=data.models.find(model=>model.name===data.runtime.model)
    assert(configured&&configured.status==='enabled')
    assert(data.providers.some(provider=>provider.id===configured.providerId&&provider.status==='connected'))
    const totals=usage.usageTotals(usage.usagePeriod(data.usage,30))
    for(const group of ['model','agent','user','tool','mcp']) {
      const breakdown=usage.usageBreakdown(usage.usagePeriod(data.usage,30),group)
      assert.equal(breakdown.reduce((sum,row)=>sum+row.requests,0),totals.requests)
      assert(Math.abs(breakdown.reduce((sum,row)=>sum+row.cost,0)-totals.cost)<1e-6)
    }
    assert(data.usage.every(row=>data.models.some(model=>model.name===row.model)))
    assert(data.usage.every(row=>data.tools.some(tool=>tool.name===row.tool)))
    assert(data.usage.every(row=>data.mcp.some(server=>server.name===row.mcp)))
    const actualAgents=load('src/modules/ai/mock/seed.ts').SEED_AGENTS.filter(agent=>agent.companyId===companyId)
    for(const resource of [...data.tools,...data.mcp])assert(resource.agents.every(name=>actualAgents.some(agent=>agent.name===name)))
    for(const days of [7,30,60]) {
      const current=usage.usagePeriod(data.usage,days),previous=usage.usagePeriod(data.usage,days,true)
      assert.equal(usage.usageDaily(current).length,days)
      assert.equal(usage.usageDaily(previous).length,days)
      const previousDates=new Set(previous.map(row=>row.date))
      assert(current.every(row=>!previousDates.has(row.date)))
      const totals=usage.usageTotals(current)
      for(const group of ['model','agent','user','tool','mcp']) {
        const grouped=usage.usageTotals(usage.usageBreakdown(current,group))
        for(const key of Object.keys(totals))assert(Math.abs(totals[key]-grouped[key])<1e-6)
      }
      assert(Math.abs(usage.usageTotals(usage.usageDaily(current)).cost-totals.cost)<1e-6)
    }
    // Returned objects must not share mutable data with the service stores.
    const returned=await mcp.fetchMcpServers(companyId)
    returned[0].capabilities[0].enabled=!returned[0].capabilities[0].enabled
    assert.deepEqual(clean(await mcp.fetchMcpServers(companyId)),data.mcp)
  }
  assert.equal(initial[2].models.filter(model=>model.modelId.startsWith('openai-test-')).length,300)
  assert(initial.filter((_,i)=>i!==2).every(data=>!data.models.some(model=>model.modelId.startsWith('openai-test-'))))
  assert.equal(new Set(initial.map(data=>data.security.policy.monthly)).size,companies.length)
  assert.equal(new Set(initial.map(data=>usage.usageTotals(usage.usagePeriod(data.usage,30)).requests)).size,companies.length)

  // Switch A -> B -> A: mutations persist in A; every B resource is unchanged.
  const a=companies[0],b=companies[1],beforeB=initial[1]
  const provider=initial[0].providers[0]
  await settings.updateProvider(provider.id,{companyId:a,name:'Retail Edited Provider',baseUrl:provider.baseUrl,enabled:true})
  await assert.rejects(()=>settings.updateProvider(provider.id,{companyId:b,name:'Wrong company',baseUrl:provider.baseUrl,enabled:true}))
  const model=await settings.createModel({providerId:provider.id,name:'Retail Only Model',modelId:'retail-only',type:'chat',contextWindow:32000,enabled:false})
  await assert.rejects(()=>settings.updateModel(model.id,{providerId:beforeB.providers[0].id,name:'Cross company',modelId:'bad',type:'chat',contextWindow:32000,enabled:true}))
  const retailTool=initial[0].tools.find(tool=>tool.status==='active')
  await tools.setToolEnabled(a,retailTool.id,false)
  await assert.rejects(()=>tools.setToolEnabled(b,retailTool.id,false))
  const retailMcp=initial[0].mcp[0]
  await mcp.toggleMcpServer(a,retailMcp.id)
  await assert.rejects(()=>mcp.toggleMcpServer(b,retailMcp.id))
  const snapshotA=await security.fetchSecurityPolicy(a)
  const policy={...snapshotA.policy,monthly:snapshotA.policy.monthly+1000}
  await security.saveSecurityPolicy(a,policy,snapshotA.revision,'Test Admin')
  await assert.rejects(()=>security.saveSecurityPolicy(a,policy,snapshotA.revision,'Stale Admin'))
  const updated=await snapshot(a)
  assert(updated.models.some(item=>item.id===model.id))
  assert.equal(updated.providers.find(item=>item.id===provider.id).name,'Retail Edited Provider')
  assert.equal(updated.runtime.provider,'Retail Edited Provider')
  assert.equal(updated.security.policy.monthly,policy.monthly)
  assert(updated.security.changes.some(change=>change.actor==='Test Admin'))
  const noOp=await security.saveSecurityPolicy(a,policy,updated.security.revision,'No-op Admin')
  assert.equal(noOp.revision,updated.security.revision)
  assert.equal(noOp.changes.length,updated.security.changes.length)
  assert(security.validateSecurityPolicy({...policy,steps:1.5}).steps)
  assert(security.validateSecurityPolicy({...policy,timeout:0}).timeout)
  assert(security.validateSecurityPolicy({...policy,daily:500,monthly:100}).monthly)
  assert(security.validateSecurityPolicy({...policy,daily:NaN}).daily)
  assert(security.validateSecurityPolicy({...policy,daily:1.234}).daily)
  noOp.policy.monthly=1
  assert.equal((await security.fetchSecurityPolicy(a)).policy.monthly,policy.monthly)
  const budget=usage.budgetUsage(updated.usage,updated.security.policy.monthly)
  assert(Math.abs(budget.remaining-(policy.monthly-budget.spent))<1e-6)
  const month=usage.usageToday().slice(0,7)
  assert(Math.abs(budget.spent-usage.usageTotals(updated.usage.filter(row=>row.date.startsWith(month))).cost)<1e-6)
  assert.equal(usage.budgetUsage(updated.usage,policy.monthly*2).used,budget.used/2)
  assert.deepEqual(await snapshot(b),beforeB)
  await settings.deleteModel(model.id)
  assert(!(await snapshot(a)).models.some(item=>item.id===model.id))
  // Runtime availability must follow edits instead of continuing to show a disabled default.
  const runtimeModel=updated.models.find(item=>item.name===updated.runtime.model)
  await settings.setModelEnabled(runtimeModel.id,false)
  assert.equal((await settings.fetchRuntimeDefaults(a)).model,'Not configured')
  await settings.setModelEnabled(runtimeModel.id,true)
  assert.equal((await settings.fetchRuntimeDefaults(a)).model,runtimeModel.name)
  // Filtered bulk removal is scoped to one provider / company.
  const disposable=await settings.createModel({providerId:provider.id,name:'Disposable Retail Model',modelId:'retail-disposable',type:'chat',contextWindow:32000,enabled:false})
  await assert.rejects(()=>settings.deleteModels(beforeB.providers[0].id,[disposable.id]))
  await settings.deleteModels(provider.id,[disposable.id])
  assert(!(await snapshot(a)).models.some(item=>item.id===disposable.id))
  const disabledTool=initial[0].tools.find(item=>item.status==='disabled')
  await assert.rejects(()=>tools.deleteTools(b,[disabledTool.id]))
  await tools.deleteTools(a,[disabledTool.id])
  assert(!(await tools.fetchTools(a)).some(item=>item.id===disabledTool.id))
  const disabledMcp=initial[0].mcp.find(item=>item.status==='disabled')
  await assert.rejects(()=>mcp.removeMcpServers(b,[disabledMcp.id]))
  await mcp.removeMcpServers(a,[disabledMcp.id])
  assert(!(await mcp.fetchMcpServers(a)).some(item=>item.id===disabledMcp.id))
  assert.deepEqual(await snapshot(b),beforeB)

  // Removing the final provider must not trigger seed resurrection on revisit.
  const emptyCompany='company-isolation-empty'
  const emptyProviders=(await settings.fetchProviders(emptyCompany)).items
  for(const item of emptyProviders){await settings.setProviderEnabled(item.id,false);await settings.deleteProvider(item.id)}
  assert.equal((await settings.fetchProviders(emptyCompany)).items.length,0)
  assert.equal((await settings.fetchSettingsSummary(emptyCompany)).models,0)
  assert.equal((await settings.fetchRuntimeDefaults(emptyCompany)).model,'Not configured')
  await assert.rejects(()=>settings.fetchProviders(''))
  await assert.rejects(()=>tools.fetchTools(''))
  await assert.rejects(()=>mcp.fetchMcpServers(''))
  await assert.rejects(()=>security.fetchSecurityPolicy(''))
  await assert.rejects(()=>usage.fetchUsageRecords(''))
  console.table(initial.map((data,i)=>({company:companies[i],providers:data.providers.length,models:data.models.length,tools:data.tools.length,mcp:data.mcp.length,monthlyBudget:data.security.policy.monthly,requests30d:usage.usageTotals(usage.usagePeriod(data.usage,30)).requests})))
  console.log('Passed: five company fixtures, unique IDs, Overview summaries, runtime availability, usage reconciliation, policy validation, mutation isolation, stale revisions, and empty-company/deletion regressions.')
}
module.exports={load,clean,mock(file,exports){modules.set(path.resolve(root,file),{exports})}}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
