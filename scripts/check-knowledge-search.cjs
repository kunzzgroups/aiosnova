// Offline actual frontend adapter check; global fetch is intercepted.
const assert=require('node:assert/strict')
const {build}=require('esbuild')
async function main(){
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './src/modules/ai/assistant/services/assistantService.ts';export {useAuthStore} from './src/stores/authStore.ts';export * from './src/modules/ai/knowledge/types/knowledge.ts'`},alias:{'@':require('node:path').resolve('src')},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline',setup(b){b.onResolve({filter:/mocks\/runtime(?:\.ts)?$/},()=>({path:'runtime',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const mockingEnabled=false;export const ensureMocking=async()=>{};'}))}}]})
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
 api.useAuthStore.setState({accessToken:'test-only-token'})
 let calls=0
 const original=global.fetch
 try{
  global.fetch=async(url,init)=>{calls++;assert.equal(url,'/api/ai/knowledge/search');assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-only-token');assert.deepEqual(JSON.parse(init.body),{companyId:'company-j1',agentId:'agent-test',question:'annual leave policy'});return Response.json({sources:[{id:'chunk',snippet:'Fourteen days',title:'Policy',type:'policy',origin:'HR',relevance:80}],scanned:1,matched:1,scope:'HR'})}
  const result=await api.retrieveEvidence({activeCompanyId:'company-j1',agentId:'agent-test',question:'annual leave policy'})
  assert.equal(result.sources[0].snippet,'Fourteen days');assert.equal(calls,1)
  assert.equal(api.getDocumentDisplayStatus({status:'stored_only',mode:'active'}),'stored_only')
  assert.equal(api.documentIsRetrievable({status:'stored_only',mode:'active'}),false)
  assert.equal(api.deriveBaseStatus('document',{documents:[{status:'stored_only',mode:'active'}]}),'stored_only')
  global.fetch=async()=>Response.json({message:'Denied'},{status:403})
  await assert.rejects(api.retrieveEvidence({activeCompanyId:'company-j1',agentId:'agent-test',question:'annual leave policy'}),/Denied/)
  console.log('PASS: authenticated text retrieval, actual snippet, company/Agent payload, denied requests without fallback, stored-only excluded.')
 }finally{global.fetch=original}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
