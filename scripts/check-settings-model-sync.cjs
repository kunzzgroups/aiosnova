// Current database API contract; fake HTTP only, no application data writes.
const assert=require('node:assert/strict')
const {build}=require('esbuild')
async function main(){
 const bundle=await build({stdin:{contents:"export * from './src/modules/ai/settings/services/settingsService.ts'",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'})
 globalThis.window={setTimeout:callback=>setTimeout(callback,0)}
 const service=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
 const company='company-j1',providerId='provider-test'
 const provider={id:providerId,companyId:company,name:'Test',providerType:'openrouter',baseUrl:'https://openrouter.ai/api/v1',enabled:true,hasApiKey:true,version:1}
 const model={id:'model-one',companyId:company,providerId,modelId:'test/chat',name:'Chat',type:'chat',status:'disabled',description:'',contextWindow:32000,capabilities:{chat:true,vision:false,toolCalling:true,contextWindow:32000},capabilitiesCheckedAt:null,capabilityError:null,version:0}
 let items=[],calls=[],syncError=false,malformed=false,wrongCompany=false,failReload=false
 globalThis.fetch=async(url,options={})=>{
  const parsed=new URL(url,'http://test.local'),body=options.body?JSON.parse(options.body):null
  calls.push({path:parsed.pathname,body})
  const ok=value=>({ok:true,json:async()=>structuredClone(value)})
  if(parsed.pathname==='/api/ai/providers')return ok({items:[provider].filter(p=>p.companyId===parsed.searchParams.get('companyId'))})
  if(parsed.pathname==='/api/ai/models/sync'){
   assert.deepEqual(body,{companyId:company,providerId})
   if(syncError)throw new Error('Network unavailable')
   if(malformed)return ok({created:-1,updated:0,capabilityWarnings:[]})
   const created=items.length?0:1;if(created)items=[structuredClone(model)]
   return ok({created,updated:created?0:1,capabilityWarnings:[]})
  }
  if(parsed.pathname==='/api/ai/models'){
   if(failReload)throw new Error('Reload unavailable')
   return ok({items:items.map(m=>wrongCompany?{...m,companyId:'company-j2'}:m),count:items.length})
  }
  if(parsed.pathname==='/api/ai/models/model-one/enabled'){
   assert.equal(body.companyId,company);assert.equal(body.providerId,providerId)
   if(body.version!==items[0].version)return {ok:false,status:409,json:async()=>({message:'Version conflict'})}
   items[0]={...items[0],status:body.enabled?'enabled':'disabled',version:body.version+1}
   return ok(items[0])
  }
  throw new Error('Unexpected endpoint: '+parsed.pathname)
 }
 await service.fetchProviders(company)
 assert.equal((await service.fetchProviderModels(providerId,company)).items.length,0)
 assert.equal((await service.syncProviderModels(company,providerId)).created,1)
 assert.equal((await service.fetchProviderModels(providerId,company)).items[0].status,'disabled')
 const enabled=await service.setModelEnabled(model.id,true,company,providerId,0)
 assert.equal(enabled.status,'enabled');assert.equal(enabled.version,1)
 assert.equal((await service.syncProviderModels(company,providerId)).created,0)
 assert.equal((await service.fetchProviderModels(providerId,company)).items.length,1)
 await assert.rejects(service.setModelEnabled(model.id,false,company,providerId,0),/Version conflict/)
 const before=calls.length
 await assert.rejects(service.setModelEnabled(model.id,true,'company-j2',providerId,1))
 assert.equal(calls.length,before)
 wrongCompany=true
 await assert.rejects(service.fetchProviderModels(providerId,company),/当前公司/)
 wrongCompany=false;syncError=true
 await assert.rejects(service.syncProviderModels(company,providerId),/Network unavailable/)
 syncError=false;malformed=true
 await assert.rejects(service.syncProviderModels(company,providerId),/格式异常/)
 malformed=false;failReload=true
 await assert.rejects(service.syncProviderModels(company,providerId),/同步已完成.*重新加载/)
 console.log('PASS: persisted sync, disabled defaults, enable/version conflict, repeat identity, company rejection, malformed response and post-sync reload failure.')
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
