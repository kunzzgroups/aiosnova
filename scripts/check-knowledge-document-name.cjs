// Offline contract test. No backend, database or model access.
const assert=require('node:assert/strict')
const {build}=require('esbuild')
async function main(){
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './src/modules/ai/knowledge/services/storedKnowledgeService.ts';export {useCompanyStore} from './src/stores/companyStore.ts';export {useAuthStore} from './src/stores/authStore.ts'`},alias:{'@':require('node:path').resolve('src')},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'offline',setup(b){b.onResolve({filter:/mocks\/runtime(?:\.ts)?$/},()=>({path:'runtime',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const mockingEnabled=false;export const ensureMocking=async()=>{};'}))}}]})
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
 api.useAuthStore.setState({accessToken:'test-token'});api.useCompanyStore.setState({companyId:'company-j1'})
 assert.equal(api.documentUploadTitle(' OCR acceptance image ',1,'ocr.png'),'OCR acceptance image')
 assert.equal(api.documentUploadTitle(' ',1,'ocr.png'),'ocr.png')
 assert.equal(api.documentUploadTitle('Group',2,'one.png'),'one.png')
 assert.equal(api.documentUploadTitle('Group',2,'two.png'),'two.png')
 const original=global.fetch;let calls=0
 try{
  global.fetch=async(url,init)=>{
   calls++;assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-token')
   if(init.body instanceof FormData){
    assert.equal(init.body.get('title'),'OCR acceptance image');assert.equal(init.body.get('file').name,'ocr.png');assert.equal(init.body.get('agentIds'),'[]')
   }else{
    assert.equal(url,'/api/ai/knowledge/documents/doc-test');assert.equal(init.method,'PATCH')
    assert.deepEqual(JSON.parse(init.body),{companyId:'company-j1',title:'New title',version:3})
   }
   return Response.json({id:'doc-test',title:'New title',version:4,status:'ready'})
  }
  await api.addKnowledgeDocument('base-test',{title:api.documentUploadTitle('OCR acceptance image',1,'ocr.png'),type:'policy',agentIds:[],file:new File(['test'],'ocr.png',{type:'image/png'})})
  const renamed=await api.renameKnowledgeDocument('doc-test','New title','company-j1',3)
  assert.equal(renamed.version,4);assert.equal(calls,2)
  global.fetch=async()=>{calls++;return Response.json({message:'Version conflict'},{status:409})}
  await assert.rejects(api.renameKnowledgeDocument('doc-test','New title','company-j1',3),e=>e.status===409)
  assert.equal(calls,3)
  api.useCompanyStore.setState({companyId:'company-j2'})
  await assert.rejects(api.renameKnowledgeDocument('doc-test','New title','company-j1',3),/company changed/)
  assert.equal(calls,3)
  console.log('PASS: single-file Name, fallback filename, multi-file names, original attachment and empty override, title-only PATCH, explicit version, 409 no retry and company-switch rejection.')
 }finally{global.fetch=original}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
