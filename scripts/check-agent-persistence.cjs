// Offline API contract check. No Java/MySQL calls and no model requests.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const result = await build({ stdin: { contents: "export * from './src/modules/ai/agents/services/agentService.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false, alias: { '@': require('node:path').resolve('src') },
  })
  const url = 'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  const api = await import(url)
  const records = new Map(); const calls = []
  const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  global.fetch = async (path, init) => {
    calls.push({ path, init })
    const parsed = new URL(path, 'http://local.test')
    assert.ok(parsed.pathname.startsWith('/api/ai/agents'))
    if (init.method === 'POST') {
      const body = JSON.parse(init.body)
      const row = { ...body, id: 'stored-uuid', merchantId: 'server-merchant', version: 0, createdAt: '2026-10-26T00:00:00', knowledgeBaseCount: body.knowledgeBaseIds.length }
      records.set(row.id, row); return response(row, 201)
    }
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body); const row = records.get('stored-uuid')
      if (body.version !== row.version) return response({ message: 'This Agent changed.' }, 409)
      assert.ok(!('knowledgeBaseIds' in body), 'Unchanged bindings should be omitted')
      const updated = { ...row, ...body, version: row.version + 1 }; records.set(row.id, updated); return response(updated)
    }
    if (init.method === 'DELETE') { assert.equal(parsed.searchParams.get('version'), '1'); records.delete('stored-uuid'); return response(null, 204) }
    assert.equal(init.cache, 'no-store')
    if (parsed.pathname.endsWith('knowledge-bases')) return response({ items: [] })
    if (parsed.pathname.endsWith('stored-uuid')) { const row = records.get('stored-uuid'); return response({ agent: row, knowledgeBaseIds: row.knowledgeBaseIds }) }
    return response({ items: [...records.values()].filter(row => row.companyId === parsed.searchParams.get('companyId')) })
  }
  assert.deepEqual(await api.fetchAgents('company-j1'), { items: [] })
  const config = { provider: 'auto', model: 'test/model', binding: { providerId: 'provider-a', modelConfigId: 'model-a' }, temperature: 0.8, topP: 0.9, maxTokens: 4096 }
  const created = await api.createAgent({ companyId: 'company-j1', name: 'Persistent', description: '', knowledgeBaseIds: [], model: config })
  assert.equal(created.id, 'stored-uuid'); assert.ok(created.createdAt.endsWith('Z'))
  await api.updateAgent(created.id, { companyId: created.companyId, version: created.version, name: 'Updated', model: config })
  assert.deepEqual((await api.fetchAgent(created.id, created.companyId)).agent.model, config)
  assert.equal((await api.fetchAgents(created.companyId)).items[0].name, 'Updated')
  await assert.rejects(api.updateAgent(created.id, { companyId: created.companyId, version: 0, name: 'Stale' }), /changed/)
  const before = calls.length
  await assert.rejects(api.updateAgent(created.id, { companyId: created.companyId, version: undefined }), /Reload/)
  assert.equal(calls.length, before)
  assert.deepEqual(await api.fetchAgentKnowledgeBases(created.companyId), { items: [] })
  await api.deleteAgent(created.id, created.companyId, 1)
  global.fetch = async () => response({ message: 'Backend unavailable' }, 503)
  await assert.rejects(api.fetchAgents(created.companyId), /Backend unavailable/)
  console.log('PASS: Agent Java routes, server IDs, cache-free reload, model/versions, no KB overwrite, 409 errors and no Mock fallback.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
