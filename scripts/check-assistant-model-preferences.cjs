const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const bundle = await build({
    stdin: { contents: "export * from './src/modules/ai/assistant/services/assistantModelMenu.ts'; export * from './src/modules/ai/settings/services/modelPreferencesService.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false,
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  const all = Array.from({ length: 700 }, (_, i) => 'model-' + i)
  const labels = Object.fromEntries(all.map((id, i) => [id, `Model ${i} (Account ${i % 2}) external/model-${i}`]))
  const vendors = Object.fromEntries(all.map((id, i) => [id, i % 2 ? 'deepseek' : 'openai']))
  const input = { all, recommended: all.slice(0, 6), value: 'model-0', query: '', vendor: 'all', vendors, labels, browseAll: false }
  assert.equal(api.assistantModelMenuIds(input).length, 6)
  assert.equal(api.assistantModelMenuIds({ ...input, browseAll: true }).length, 700)
  assert.equal(api.assistantModelMenuIds({ ...input, browseAll: true, vendor: 'deepseek' }).length, 350)
  assert.deepEqual(api.assistantModelMenuIds({ ...input, query: 'external/model-699' }), ['model-699'])
  assert.equal(api.assistantModelMenuIds({ ...input, value: '', recommended: ['deleted'] }).length, 0)
  assert.equal(api.availableDefaultModelId('deleted', all), '')
  assert.equal(api.availableDefaultModelId(null, all), '')
  assert.equal(api.availableDefaultModelId('model-5', all), 'model-5')
  let stored = { companyId: 'company-j1', defaultModelConfigId: 'model-5', recommendedModelConfigIds: ['model-5'], version: 0, storageReady: true }
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'PUT') {
      const input = JSON.parse(init.body)
      if (input.version !== stored.version) return { ok: false, json: async () => ({ message: 'Model preferences changed. Reload before saving.' }) }
      stored = { ...input, version: stored.version + 1 }
    }
    return { ok: true, json: async () => structuredClone(stored) }
  }
  const before = await api.fetchModelPreferences('company-j1')
  await api.saveModelPreferences(before)
  await assert.rejects(api.saveModelPreferences(before), /changed/)
  await assert.rejects(api.fetchModelPreferences('company-j2'), /different company/)
  console.log('PASS: 700-model catalog stays compact; browse/search/vendor filters; missing defaults never fall back; preference versions and company scope')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
