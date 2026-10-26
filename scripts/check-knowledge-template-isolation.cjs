// Offline permission and copy/assignment checks. No database or external API calls.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const result = await build({
    stdin: { contents: "export * from './src/modules/ai/mock/mockStore.ts'; export * from './src/modules/ai/mock/permissions.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false,
    alias: { '@': require('node:path').resolve('src') },
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const state = api.getMockState()
  const user = api.MOCK_USER
  assert.ok(api.listBasesVisibleFrom(user, 'company-j2').every(base => base.companyId === 'company-j2'))
  assert.ok(!api.listBasesVisibleFrom(user, 'company-j2').some(base => base.id === 'kb-hr'))
  assert.deepEqual(api.listBasesVisibleFrom(user, 'company-tokyo-izakaya'), [])
  assert.ok(!api.canUseTemplates(user, 'company-wholesale'))
  assert.deepEqual(api.listTemplatesForCompany(user, 'company-wholesale', true), [])
  assert.ok(!api.canPromote(user, { companyId: 'company-j2' }))
  assert.ok(api.canPromote({ ...user, memberships: [{ companyId: 'company-j2', role: 'admin' }] }, { companyId: 'company-j2' }))
  const source = state.bases.find(base => base.id === 'kb-hr')
  const sourceBefore = structuredClone(source)
  const promoted = api.promoteBaseToTemplate(user, { baseId: 'kb-hr', allowedCompanyIds: ['company-j2'] })
  const template = state.templates.find(template => template.id === promoted.templateId)
  assert.deepEqual(template.allowedCompanyIds, ['company-j1', 'company-j2'])
  assert.ok(api.listTemplatesForCompany(user, 'company-j2').some(template => template.id === promoted.templateId))
  const adopted = api.adoptTemplate(user, { templateId: promoted.templateId, companyId: 'company-j2' })
  const copy = state.bases.find(base => base.id === adopted.baseId)
  assert.notEqual(copy.id, source.id)
  assert.equal(copy.companyId, 'company-j2')
  assert.deepEqual(copy.allowedCompanyIds, ['company-j2'])
  assert.deepEqual(api.agentIdsForBase(copy.id), [])
  const documents = state.documents.filter(doc => doc.baseId === copy.id)
  assert.equal(documents.length, promoted.documentsCaptured)
  assert.ok(documents.every(doc => !state.documents.some(original => original.baseId === source.id && original.id === doc.id)))
  api.setBaseAgents(copy.id, ['ag-j2-hr', 'ag-hr'])
  assert.deepEqual(api.agentIdsForBase(copy.id), ['ag-j2-hr'])
  copy.name = 'J2 edited its own copy'
  assert.deepEqual(source, sourceBefore)
  assert.notEqual(template.name, copy.name)
  assert.throws(() => api.adoptTemplate(user, { templateId: promoted.templateId, companyId: 'company-retail' }))
  assert.throws(() => api.adoptTemplate(user, { templateId: 'tpl-operations-sop', companyId: 'company-wholesale' }))
  const privateTemplate = { id: 'test-private', name: 'Private', description: '', category: 'Test', kind: 'document', ownerCompanyId: 'company-j2', allowedCompanyIds: ['company-j2'] }
  state.templates.push(privateTemplate)
  state.templates.push({ ...privateTemplate, id: 'test-shared', allowedCompanyIds: ['company-j2', 'company-retail'] })
  assert.ok(!api.listTemplatesForCompany(user, 'company-j1', true).some(template => template.id === 'test-private'))
  assert.ok(api.listTemplatesForCompany(user, 'company-j1', true).some(template => template.id === 'test-shared'))
  assert.ok(!api.listTemplatesForCompany(user, 'company-j1').some(template => template.id === 'test-shared'))
  assert.throws(() => api.adoptTemplate(user, { templateId: 'test-shared', companyId: 'company-j1' }))
  assert.ok(!api.canEditTemplate(user, privateTemplate, 'company-j1'))
  // Nested Skill schema copies must not alias the source/template.
  const skillBase = state.bases.find(base => base.kind === 'skill' && base.companyId === 'company-j1')
  const skill = state.skills.find(skill => skill.baseId === skillBase.id)
  skill.inputSchema = { nested: { value: 'source' } }
  const skillPromotion = api.promoteBaseToTemplate(user, { baseId: skillBase.id, allowedCompanyIds: ['company-j2'] })
  const skillAdoption = api.adoptTemplate(user, { templateId: skillPromotion.templateId, companyId: 'company-j2' })
  state.skills.find(skill => skill.baseId === skillAdoption.baseId).inputSchema.nested.value = 'copy'
  assert.equal(skill.inputSchema.nested.value, 'source')
  assert.equal(state.templates.find(template => template.id === skillPromotion.templateId).skills[0].inputSchema.nested.value, 'source')
  console.log('PASS: company isolation, authorized Promote/Use, private template exception, oversight cannot adopt/edit, independent J2 copies and same-company Agent assignment.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
