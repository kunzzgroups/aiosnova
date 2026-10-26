// Frontend API contract check. No live server or database is used.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const bundle = await build({ stdin: { contents: `
    export * from './src/modules/ai/knowledge/services/knowledgeService.ts';
    export * from './src/modules/ai/knowledge/services/templateService.ts';
    export { useCompanyStore } from './src/stores/companyStore.ts';
    export { useAuthStore } from './src/stores/authStore.ts';`, resolveDir: process.cwd() },
    alias: { '@': require('node:path').resolve('src') }, bundle: true, format: 'esm', platform: 'node', write: false })
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  api.useAuthStore.setState({ accessToken: 'test-session' })
  api.useCompanyStore.setState({ companyId: 'company-j1' })
  const records = new Map(), calls = []
  const rights = { canRead: true, canWrite: true, canPromote: true, canUseTemplates: true, canOverseeTemplates: true }
  const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  let template
  global.fetch = async (path, init) => {
    const url = new URL(path, 'http://local.test'), method = init.method || 'GET'
    calls.push({ path, init })
    assert.ok(url.pathname.startsWith('/api/ai/knowledge/'))
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-session')
    if (init.body instanceof FormData) {
      if (url.pathname.endsWith('/skills') || url.pathname.endsWith('/data-sources')) {
        const metadata = JSON.parse(init.body.get('payload'))
        assert.equal(metadata.companyId, 'company-j1')
        assert.equal(init.body.get('file').name, 'spec.txt')
        assert.ok(!('file' in metadata), 'Binary file must not be JSON-serialized')
        return response({ id: 'content-sql', name: metadata.name }, 201)
      }
      assert.equal(init.body.get('companyId'), 'company-j1')
      assert.equal(init.body.get('agentIds'), '[]', 'Explicit empty override was lost')
      assert.equal(init.body.get('file').name, 'policy.txt')
      return response({ id: 'doc-sql', title: 'Policy' }, 201)
    }
    const body = init.body ? JSON.parse(init.body) : null
    const company = body?.companyId ?? url.searchParams.get('companyId')
    assert.ok(company === 'company-j1' || company === 'company-j2')
    if (url.pathname.endsWith('/permissions')) return response(rights)
    if (url.pathname.endsWith('/templates/promote')) {
      assert.equal(body.version, 0)
      template = { id: 'template-sql', name: 'HR', ownerCompanyId: company, allowedCompanyIds: body.allowedCompanyIds, version: 1, canEdit: true, canDelete: true }
      return response({ templateId: template.id })
    }
    if (url.pathname.endsWith('/templates/adopt')) {
      assert.equal(company, 'company-j2'); assert.equal(body.templateId, template.id)
      return response({ baseId: 'independent-copy', baseName: 'HR', documentsCreated: 1, skillsCreated: 0, dataSourcesCreated: 0 })
    }
    if (url.pathname.endsWith('/templates')) return response({ items: template ? [{ ...template, canEdit: company === 'company-j1', canDelete: company === 'company-j1' }] : [], permissions: { ...rights, canPromote: company === 'company-j1' } })
    if (url.pathname.endsWith('/templates/template-sql') && method === 'PATCH') {
      assert.equal(body.version, 1); template = { ...template, ...body, version: 2 }; return response(template)
    }
    if (url.pathname.endsWith('/bases') && method === 'POST') {
      const row = { ...body, id: 'base-sql', version: 0, merchantId: 'trusted-server' }; records.set(row.id, row); return response(row, 201)
    }
    if (url.pathname.endsWith('/bases') && method === 'GET') {
      assert.equal(init.cache, 'no-store'); return response({ items: [...records.values()].filter(row => row.companyId === company), permissions: rights })
    }
    if (url.pathname.endsWith('/bases/base-sql') && method === 'GET') return response({ base: records.get('base-sql'), documents: [], skills: [], dataSources: [], baseAgentIds: [], effective: [] })
    if (url.pathname.endsWith('/bases/base-sql') && method === 'PATCH') {
      const row = records.get('base-sql'); if (body.version !== row.version) return response({ message: 'Reload before saving again.' }, 409)
      const next = { ...row, ...body, version: row.version + 1 }; records.set(next.id, next); return response(next)
    }
    if (url.pathname.endsWith('/documents/doc-sql/agents')) { assert.equal(body.agentIds, null); return response(null, 204) }
    throw new Error('Unexpected route: ' + method + ' ' + path)
  }
  assert.equal(api.userCanWriteKnowledge('company-j1'), false)
  await api.createKnowledgeBase({ companyId: 'company-j1', name: 'HR', description: '', agentIds: [] })
  assert.equal((await api.fetchKnowledgeBases('company-j1')).items[0].id, 'base-sql')
  assert.equal(api.userCanWriteKnowledge('company-j1'), true)
  await api.fetchKnowledgeBase('base-sql')
  await api.promoteKnowledgeBaseToTemplate({ baseId: 'base-sql', allowedCompanyIds: ['company-j2'] })
  await api.fetchTemplatesForCompany('company-j1')
  assert.equal(api.userCanEditTemplate('template-sql', 'company-j1'), true)
  await api.updateKnowledgeTemplate({ templateId: 'template-sql', name: 'HR template', version: 1 })
  await api.addKnowledgeDocument('base-sql', { title: 'Policy', type: 'policy', agentIds: [], file: new File(['test'], 'policy.txt', { type: 'text/plain' }) })
  await api.addKnowledgeSkill('skill-base', { name: 'Lookup', description: '', agentIds: null, file: new File(['spec'], 'spec.txt') })
  await api.addKnowledgeDataSource('data-base', { name: 'API', kind: 'api', config: {}, agentIds: null, file: new File(['spec'], 'spec.txt') })
  await api.setDocumentAgents('doc-sql', null)
  await api.updateKnowledgeBase('base-sql', { name: 'New name', version: 0 })
  assert.equal((await api.fetchKnowledgeBases('company-j1')).items[0].name, 'New name')
  await assert.rejects(api.updateKnowledgeBase('base-sql', { name: 'Stale', version: 0 }), /Reload/)
  api.useCompanyStore.setState({ companyId: 'company-j2' })
  await api.fetchTemplates('company-j2')
  assert.equal(api.userCanPromoteBase('base-sql'), false)
  assert.equal(api.userCanEditTemplate('template-sql', 'company-j2'), false)
  await api.adoptKnowledgeTemplate({ companyId: 'company-j2', templateId: 'template-sql' })
  const before = calls.length
  await assert.rejects(api.adoptKnowledgeTemplate({ companyId: 'company-j1', templateId: 'template-sql' }), /company changed/)
  assert.equal(calls.length, before)
  global.fetch = async () => response({ message: 'Database unavailable' }, 503)
  await assert.rejects(api.fetchKnowledgeBases('company-j2'), /Database unavailable/)
  await assert.rejects(api.fetchTemplates('company-j2'), /Database unavailable/)
  console.log('PASS: Knowledge/Template Java routes, fresh SQL reads, permissions, versions, upload/empty override, company scope and no Mock fallback. Simulated HTTP only.')
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1 })
