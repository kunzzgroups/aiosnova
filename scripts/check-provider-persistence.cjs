// Isolated service checks: fake HTTP only; no database or real API keys.
const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const bundle = await build({
    stdin: { contents: "export * from './src/modules/ai/settings/services/settingsService.ts'", resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node',
  })
  globalThis.window = { setTimeout: callback => setTimeout(callback, 0) }
  const service = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  const row = (id, companyId = 'company-j1', enabled = false) => ({ id, companyId, enabled, version: 2, name: id, providerType: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', hasApiKey: true })
  let rows = [row('a'), row('b'), row('c', 'company-j2'), row('enabled', 'company-j1', true)]
  const calls = []
  let conflict = false
  let releaseList = null
  let holdList = false
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url, 'http://test.local')
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, method, body })
    const response = data => ({ ok: true, json: async () => structuredClone(data) })
    if(parsed.pathname==='/api/ai/models'&&!rows.some(row=>row.id===parsed.searchParams.get('providerId')&&row.companyId===parsed.searchParams.get('companyId')))return {ok:false,status:404,json:async()=>({message:'Provider not found'})};
    if(parsed.pathname==='/api/ai/models')return response({items:[{id:'stored-model-a',companyId:'company-j1',providerId:'a',modelId:'fake/model',name:'Fake',type:'chat',status:'disabled',contextWindow:32,capabilities:null,capabilitiesCheckedAt:null,capabilityError:null,description:'',version:0}],count:1})
    if (method === 'GET') {
      const snapshot = rows.filter(row => row.companyId === parsed.searchParams.get('companyId'))
      if (holdList) { holdList = false; await new Promise(resolve => { releaseList = resolve }) }
      return response({ items: snapshot })
    }
    if (parsed.pathname.endsWith('/bulk-delete')) {
      if (conflict) return { ok: false, status: 409, json: async () => ({ message: 'Version conflict' }) }
      assert.equal(method, 'POST')
      rows = rows.filter(row => row.companyId !== body.companyId || !body.items.some(item => item.id === row.id))
      return response({ deleted: body.items.length })
    }
    if (method === 'PUT') {
      assert.equal(body.version, 1, 'editing must retain the version from when the form opened')
      return { ok: false, status: 409, json: async () => ({ message: 'Version conflict' }) }
    }
    throw new Error('Unexpected request')
  }
  await service.fetchProviders('company-j1')
  await service.fetchProviders('company-j2')
  await assert.rejects(service.createModel({ providerId: 'a', modelId: 'fake/model', name: 'Fake', type: 'chat', enabled: false, contextWindow: 32 }), /同步/)
  const model = (await service.fetchProviderModels('a','company-j1')).items[0]
  const before = calls.length
  for (const ids of [[], ['a', 'a'], ['a', 'c'], ['a', 'enabled'], Array(101).fill('a')]) {
    await assert.rejects(service.deleteProviders('company-j1', ids))
  }
  assert.equal(calls.length, before)
  console.log('PASS: invalid selections make no deletion requests')

  conflict = true
  await assert.rejects(service.deleteProviders('company-j1', ['a', 'b']), /Version conflict/)
  assert.equal((await service.fetchProvider('a')).id, 'a')
  assert.equal((await service.fetchProviderModels('a','company-j1')).items[0].id, model.id)
  console.log('PASS: HTTP conflict preserves provider and model caches')
  conflict = false

  service.recordProviderConnectionTest('company-j1', 'enabled', 'https://openrouter.ai/api/v1', 'fake/model', { ok: true, message: 'Connected' })
  await service.fetchProviders('company-j1')
  assert.equal((await service.fetchProvider('enabled')).status, 'connected')
  console.log('PASS: unchanged database records retain session diagnostics')

  await assert.rejects(service.updateProvider('a', { companyId: 'company-j1', name: 'Old form', baseUrl: 'https://openrouter.ai/api/v1', enabled: false }, 1), /Version conflict/)
  console.log('PASS: edit submits the form version instead of a newer cache version')

  holdList = true
  const first = service.fetchProviders('company-j1')
  const second = service.fetchProviders('company-j1')
  await service.deleteProviders('company-j1', ['a', 'b'])
  const bulkCall = calls.findLast(call => call.url.endsWith('/bulk-delete'))
  assert.deepEqual(bulkCall.body, { companyId: 'company-j1', items: [{ id: 'a', version: 2 }, { id: 'b', version: 2 }] })
  releaseList()
  for (const result of await Promise.all([first, second])) assert(!result.items.some(row => row.id === 'a' || row.id === 'b'))
  await assert.rejects(service.fetchProvider('a'))
  await assert.rejects(service.fetchProviderModels('a','company-j1'))
  assert.equal((await service.fetchProvider('c')).companyId, 'company-j2')
  console.log('PASS: one batch request sends versions; success clears only selected providers and models')
  console.log('PASS: a late list response cannot restore deleted records')

  const start = calls.length
  const lists = await Promise.all([service.fetchProviders('company-j1'), service.fetchProviders('company-j1')])
  assert.equal(calls.length - start, 1)
  assert.deepEqual(lists[0], lists[1])
  console.log('PASS: concurrent company lists share one HTTP request')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
