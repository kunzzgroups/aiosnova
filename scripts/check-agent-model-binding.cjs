// Offline only. No database writes or paid model requests.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const result = await build({
    stdin: { contents: "export * from './src/modules/ai/agents/services/agentModelSelection.ts'; export * from './src/modules/ai/settings/services/providerApiService.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false,
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const options = [
    { id: 'config-a', providerId: 'account-a', modelId: 'deepseek/example', name: 'Same model', label: 'Same model (A)' },
    { id: 'config-b', providerId: 'account-b', modelId: 'deepseek/example', name: 'Same model', label: 'Same model (B)' },
  ]
  const config = { provider: 'auto', model: 'deepseek/example', binding: { providerId: 'account-b', modelConfigId: 'config-b' } }
  assert.equal(api.resolveAgentModelOption(config, options).id, 'config-b')
  assert.throws(() => api.resolveAgentModelOption(config, [options[0]]), /disabled, deleted/)
  assert.throws(() => api.resolveAgentModelOption({ ...config, binding: { providerId: 'account-a', modelConfigId: 'config-b' } }, options), /disabled, deleted/)
  assert.throws(() => api.resolveAgentModelOption({ provider: 'openai', model: 'old' }, options), /legacy/)
  assert.equal(api.resolveAgentModelOption({ provider: 'auto', model: '' }, options), undefined)
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/ai/providers/account-b/test-connection')
    assert.deepEqual(JSON.parse(init.body), { companyId: 'company-j1', modelId: 'deepseek/example', version: 4 })
    assert.equal(init.method, 'POST')
    return { ok: true, json: async () => ({ ok: true, message: 'Test success' }) }
  }
  assert.equal((await api.testStoredProviderConnection('company-j1', 'account-b', 'deepseek/example', 4)).ok, true)
  console.log('PASS: exact UUID/account binding, unavailable model rejection, no cross-account fallback, legacy reselect, Auto, saved-key test sends no API key')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
