const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const bundle = await build({ entryPoints: ['src/modules/ai/settings/services/companyModelPresentation.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  const base = { modelId: 'deepseek/test', name: 'DeepSeek Test', status: 'disabled', capabilities: { chat: true }, capabilitiesCheckedAt: '2026-01-01', capabilityError: null }
  const models = [{ ...base, id: 'a', providerId: 'p' }, { ...base, id: 'b', providerId: 'q' }, { ...base, id: 'c', providerId: 'p', capabilities: null }, { ...base, id: 'd', providerId: 'p', status: 'enabled' }]
  const filters = { query: '', providerId: 'all', vendor: 'all', status: 'all' }
  assert.equal(api.filterCompanyModels(models, filters).length, 4)
  assert.deepEqual(api.filterCompanyModels(models, { ...filters, providerId: 'q' }).map(m => m.id), ['b'])
  assert.equal(api.filterCompanyModels(models, { ...filters, status: 'enabled' }).length, 1)
  assert.equal(api.filterCompanyModels(models, { ...filters, query: 'missing' }).length, 0)
  assert.deepEqual(api.companyModelActionTargets(models, 'enable').map(m => m.id), ['a', 'b'])
  assert.deepEqual(api.companyModelActionTargets(models, 'disable').map(m => m.id), ['d'])
  assert.deepEqual(api.companyModelActionTargets(models, 'delete').map(m => m.id), ['a', 'b', 'c'])
  console.log('PASS: company catalog keeps Provider accounts distinct; filters and eligible bulk targets')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
