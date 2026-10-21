const assert=require('node:assert/strict')
const {load,clean}=require('./check-settings-companies.cjs')
const tools=load('src/modules/ai/settings/services/toolsService.ts')
const mcp=load('src/modules/ai/settings/services/mcpService.ts')
const settings=load('src/modules/ai/settings/services/settingsService.ts')
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
    const result=await settings.testProviderConnection({companyId:company,providerId:provider.id,baseUrl,outcome:'success'})
    assert.equal(result.ok,false)
    assert.deepEqual(clean(await settings.fetchProvider(provider.id)),before)
  }
  assert.deepEqual(clean(await tools.fetchTools('company-j2')),otherTools)
  assert.deepEqual(clean(await mcp.fetchMcpServers('company-j2')),otherMcp)
  console.log('Passed: concurrent assignment/edit rejection, preserved assignments, MCP diagnostic reset, invalid URL checks without state mutation and company isolation.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
