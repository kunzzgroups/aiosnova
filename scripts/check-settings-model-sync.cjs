// Current database API contract; fake HTTP only, no application data writes.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
    const bundle = await build({ stdin: { contents: "export * from './src/modules/ai/settings/services/settingsService.ts'", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' })
    globalThis.window = { setTimeout: callback => setTimeout(callback, 0) }
    const service = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
    const company = 'company-j1', providerId = 'provider-test'
    const provider = {
        id: providerId,
        companyId: company,
        name: 'Test',
        providerType: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        enabled: true,
        hasApiKey: true,
        version: 1,

        connectionRevision: 0,
        verificationStatus: 'verified',
        verificationRevision: 0,
        verificationModelId: 'test/chat',
        verificationCheckedAt: '2026-10-26T07:00:00',
        verificationLastSuccessAt: '2026-10-26T07:00:00',
        verificationErrorCode: null,
        verificationErrorMessage: null,
    }
    const model = { id: 'model-one', companyId: company, providerId, modelId: 'test/chat', name: 'Chat', type: 'chat', status: 'disabled', description: '', contextWindow: 32000, capabilities: { chat: true, vision: false, toolCalling: true, contextWindow: 32000 }, capabilitiesCheckedAt: null, capabilityError: null, version: 0 }
    let items = [], calls = [], syncError = false, malformed = false, wrongCompany = false, failReload = false
    globalThis.fetch = async (url, options = {}) => {
        const parsed = new URL(url, 'http://test.local'), body = options.body ? JSON.parse(options.body) : null
        calls.push({ path: parsed.pathname, body })
        const ok = value => ({ ok: true, json: async () => structuredClone(value) })
        if (parsed.pathname === '/api/ai/providers') return ok({ items: [provider].filter(p => p.companyId === parsed.searchParams.get('companyId')) })
        if (parsed.pathname === '/api/ai/models/sync') {
            assert.deepEqual(body, { companyId: company, providerId })
            if (syncError) throw new Error('Network unavailable')
            if (malformed) return ok({ created: -1, updated: 0, capabilityWarnings: [] })
            const created = items.length ? 0 : 1; if (created) items = [structuredClone(model)]
            return ok({ created, updated: created ? 0 : 1, capabilityWarnings: [] })
        }
        if (parsed.pathname === '/api/ai/models') {
            if (failReload) throw new Error('Reload unavailable')
            return ok({ items: items.map(m => wrongCompany ? { ...m, companyId: 'company-j2' } : m), count: items.length })
        }
        if (parsed.pathname === '/api/ai/models/model-one/enabled') {
            assert.equal(body.companyId, company); assert.equal(body.providerId, providerId)
            if (body.version !== items[0].version) return { ok: false, status: 409, json: async () => ({ message: 'Version conflict' }) }
            items[0] = { ...items[0], status: body.enabled ? 'enabled' : 'disabled', version: body.version + 1 }
            return ok(items[0])
        }
        throw new Error('Unexpected endpoint: ' + parsed.pathname)
    }
    await service.fetchProviders(company)
    assert.equal((await service.fetchProviderModels(providerId, company)).items.length, 0)
    assert.equal((await service.syncProviderModels(company, providerId)).created, 1)
    assert.equal((await service.fetchProviderModels(providerId, company)).items[0].status, 'disabled')
    const enabled = await service.setModelEnabled(model.id, true, company, providerId, 0)
    assert.equal(enabled.status, 'enabled'); assert.equal(enabled.version, 1)
    assert.equal((await service.syncProviderModels(company, providerId)).created, 0)
    const repeatedModels =
        (await service.fetchProviderModels(providerId, company)).items

    assert.equal(repeatedModels.length, 1)
    assert.equal(repeatedModels[0].id, model.id)
    assert.equal(repeatedModels[0].status, 'enabled')
    assert.equal((await service.fetchProviderModels(providerId, company)).items.length, 1)
    await assert.rejects(service.setModelEnabled(model.id, false, company, providerId, 0), /Version conflict/)
    const before = calls.length
    await assert.rejects(service.setModelEnabled(model.id, true, 'company-j2', providerId, 1))
    assert.equal(calls.length, before)
    wrongCompany = true

    await assert.rejects(
        service.fetchProviderModels(providerId, company),
        /another company or Provider/,
    )

    wrongCompany = false

    syncError = true

    await assert.rejects(
        service.syncProviderModels(company, providerId),
        /Network unavailable/,
    )

    assert.equal(
        (await service.fetchProvider(providerId)).status,
        'connected',
    )

    syncError = false

    malformed = true

    await assert.rejects(
        service.syncProviderModels(company, providerId),
        /Invalid sync response/,
    )

    malformed = false

    failReload = true

    const syncCallsBeforeReloadFailure = calls.filter(
        call => call.path === '/api/ai/models/sync',
    ).length

    const syncWithWarning =
        await service.syncProviderModels(company, providerId)

    assert.equal(syncWithWarning.created, 0)
    assert.equal(syncWithWarning.updated, 1)
    assert.match(syncWithWarning.reloadWarning, /Reload unavailable/)

    assert.equal(
        calls.filter(
            call => call.path === '/api/ai/models/sync',
        ).length,
        syncCallsBeforeReloadFailure + 1,
    )

    assert.equal(
        (await service.fetchProvider(providerId)).status,
        'connected',
    )

    failReload = false

    const recoveredModels =
        (await service.fetchProviderModels(providerId, company)).items

    assert.equal(recoveredModels.length, 1)
    assert.equal(recoveredModels[0].id, model.id)
    assert.equal(recoveredModels[0].status, 'enabled')
    console.log(
        'PASS: disabled defaults, repeated IDs/enabled states, version/company guards, sync failures, reload warnings and retained verification.',
    )
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
