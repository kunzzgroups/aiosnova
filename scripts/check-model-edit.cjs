// Fake HTTP only: no real model calls or database changes.
const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const bundle = await build({
    entryPoints: ['src/modules/ai/settings/services/settingsService.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node',
  })
  const service = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  const provider = { id: 'p', companyId: 'company-j1', name: 'Test', providerType: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', enabled: true, hasApiKey: true, version: 0 }
  let stored = { id: 'm', companyId: provider.companyId, providerId: 'p', modelId: 'fake/model', name: 'Before', type: 'chat', status: 'enabled', description: '', contextWindow: null, capabilities: { chat: true, vision: false, toolCalling: false, contextWindow: 32 }, capabilitiesCheckedAt: null, capabilityError: null, version: 2 }
  const requests = []
  const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => structuredClone(data) })
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body)
      requests.push(body)
      assert.equal(url, '/api/ai/models/m')
      if (body.version !== stored.version) return reply({ message: '模型配置已被修改，请刷新列表后重试' }, 409)
      stored = { ...stored, ...body, contextWindow: body.contextWindow, status: body.enabled ? 'enabled' : 'disabled', version: stored.version + 1 }
      return reply(stored)
    }
    if (String(url).startsWith('/api/ai/providers?')) return reply({ items: [provider] })
    if (String(url).startsWith('/api/ai/models?')) return reply({ items: [stored], count: 1 })
    throw new Error('Unexpected request: ' + url)
  }
  await service.fetchProviders(provider.companyId)
  await service.fetchProviderModels('p', provider.companyId)
  const payload = { providerId: 'p', modelId: 'fake/model', name: 'Edited', type: 'chat', enabled: true, description: '', contextWindow: 0 }
  // Form opened at version 1, while a later list has already cached version 2.
  await assert.rejects(service.updateModel('m', payload, provider.companyId, 1), /已被修改/)
  assert.equal(requests[0].version, 1)
  assert.equal(service.resolveExecutableModel(provider.companyId, 'p', 'm').model.name, 'Before')
  const updated = await service.updateModel('m', payload, provider.companyId, 2)
  assert.equal(updated.name, 'Edited')
  assert.equal(updated.version, 3)
  assert.equal(updated.contextWindow, null)
  assert.equal(service.resolveExecutableModel(provider.companyId, 'p', 'm').model.name, 'Edited')
  const count = requests.length
  await assert.rejects(service.updateModel('m', { ...payload, modelId: 'different' }, provider.companyId, 3), /cannot be changed/)
  await assert.rejects(service.updateModel('m', payload, 'other-company', 3), /Provider/)
  assert.equal(requests.length, count)
  console.log('PASS: form version retained despite newer cache; conflict preserves cache; PUT updates cache; unknown context stays null; scope and immutable ID checks')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
