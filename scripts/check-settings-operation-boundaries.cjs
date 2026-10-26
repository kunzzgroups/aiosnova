const assert=require('node:assert/strict')
const {load,clean,api}=require('./check-settings-companies.cjs')
const tools=load('src/modules/ai/settings/services/toolsService.ts')
const mcp=load('src/modules/ai/settings/services/mcpService.ts')
const settings=load('src/modules/ai/settings/services/settingsService.ts')
const {testModelConnection}=load('src/modules/ai/settings/services/connectionService.ts')
const {testStoredProviderConnection}=load('src/modules/ai/settings/services/providerApiService.ts')
async function main(){
  const company='company-j1'
  const otherTools=clean(await tools.fetchTools('company-j2'))
  const otherMcp=clean(await mcp.fetchMcpServers('company-j2'))
  const tool=(await tools.fetchTools(company))[0]
  const pendingTool=assert.rejects(tools.saveToolAgents(company,tool.id,[]),/configuration changed/)
  const savedTool=await tools.saveTool(company,{...tool,name:'Concurrent tool edit',enabled:tool.status!=='disabled'},tool.id)
  await pendingTool
  assert.deepEqual(clean((await tools.fetchTool(company,tool.id)).agents),clean(savedTool.agents))
  let server=(await mcp.fetchMcpServers(company)).find(s=>s.status==='connected')
  const pendingAccess=assert.rejects(mcp.saveMcpAccess(company,server.id,[]),/configuration changed/)
  server=await mcp.saveMcpServer(company,{...server,name:'Concurrent connection edit',enabled:true},server.id)
  await pendingAccess
  assert.deepEqual(clean((await mcp.fetchMcpServers(company)).find(s=>s.id===server.id).agents),clean(server.agents))
  server=await mcp.testMcpServer(company,server.id,'success')
  assert(server.connectedAt)
  server=await mcp.toggleMcpServer(company,server.id)
  assert.equal(server.connectedAt,null)
  server=await mcp.toggleMcpServer(company,server.id)
  assert.equal(server.connectedAt,null)
  assert.equal(server.status,'not_verified')
  const provider=(await settings.fetchProviders(company)).items[0]
  const before=clean(await settings.fetchProvider(provider.id))
  for(const baseUrl of ['https://','https://?invalid','javascript:alert(1)','https://bad host.test']){
    const result=await testModelConnection({baseUrl,apiKey:'fake-draft-key',modelId:'test/shared-model'})
    assert.equal(result.ok,false)
    assert.deepEqual(clean(await settings.fetchProvider(provider.id)),before)
    assert.equal(api.calls.at(-1).path,'/api/ai/test-connection')
    assert(!Object.hasOwn(api.calls.at(-1).body,'providerId'),'unsaved draft must not identify a stored Provider')
  }
  const sqlBefore=clean(api.providers.get(provider.id))
  await assert.rejects(()=>testStoredProviderConnection(company,provider.id,'test/shared-model',provider.version+1),/Version conflict/)
  await assert.rejects(()=>testStoredProviderConnection('company-j2',provider.id,'test/shared-model',provider.version),/not found in this company/)
  await assert.rejects(()=>settings.updateProvider(provider.id,{companyId:company,name:'Stale edit',baseUrl:provider.baseUrl,enabled:true},provider.version+1),/Version conflict/)
  assert.deepEqual(clean(api.providers.get(provider.id)),sqlBefore)
  assert.deepEqual(clean(await settings.fetchProvider(provider.id)),before)
  const fetchFixture=api.fetch
  try {
    api.fetch=async()=>({ok:false,status:503,json:async()=>({message:'Simulated service unavailable'})})
    await assert.rejects(()=>settings.updateProvider(provider.id,{companyId:company,name:'Failed edit',baseUrl:provider.baseUrl,enabled:true},provider.version),/Simulated service unavailable/)
    assert.deepEqual(clean(await settings.fetchProvider(provider.id)),before,'failed write must preserve cache')
    api.fetch=async()=>({ok:true,status:200,json:async()=>({items:[{...api.providers.get(provider.id),companyId:'company-j2'}]})})
    await assert.rejects(()=>settings.fetchProviders(company),/another company/)
    assert.deepEqual(clean(await settings.fetchProvider(provider.id)),before,'foreign response must not overwrite cache')
  } finally { api.fetch=fetchFixture }
  assert.deepEqual(clean(await tools.fetchTools('company-j2')),otherTools)
  assert.deepEqual(clean(await mcp.fetchMcpServers('company-j2')),otherMcp)
  console.log('PASS: concurrent assignments/edits, MCP diagnostic reset, draft isolation, stored verification scope/version guards, failed writes and foreign responses preserve cache; company isolation. Simulated HTTP only.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
