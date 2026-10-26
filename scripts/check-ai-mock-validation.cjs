const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const result = await build({
    stdin: { contents: "export { createMockSnapshot } from './src/modules/ai/mock/exportSnapshot.ts'; export { validateMockSnapshot } from './src/modules/ai/mock/validateSnapshot.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false,
    alias: { '@': require('node:path').resolve('src') }, define: { 'import.meta.env.DEV': 'true' },
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const original = api.createMockSnapshot()
  // Seed legacy model configurations may require reselection; isolate structural tests.
  for (const agent of original.data.agents) agent.model = { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 }
  const crossOwner = structuredClone(original)
  crossOwner.data.agents.find(agent => agent.id === 'ag-j2-hr').knowledgeBaseIds.push('kb-hr')
  assert.ok(api.validateMockSnapshot(crossOwner).errors.some(error => error.includes('ag-j2-hr') && error.includes('different company')))
  for (const agent of original.data.agents) agent.knowledgeBaseIds = agent.knowledgeBaseIds.filter(id => original.data.bases.some(base => base.id === id && base.companyId === agent.companyId))
  const validate = api.validateMockSnapshot
  assert.deepEqual(validate(original).errors, [])
  const doc = original.data.documents[0]
  const base = original.data.bases.find(base => base.id === doc.baseId)
  const agent = original.data.agents.find(agent => agent.status === 'active' && agent.companyId === base.companyId)
  const empty = structuredClone(original)
  empty.data.documentOverrides = [{ documentId: doc.id, agentIds: [] }]
  const before = JSON.stringify(empty)
  const report = validate(empty)
  assert.deepEqual(report.errors, [])
  assert.equal(report.counts.emptyDocumentOverrides, 1)
  assert.equal(report.counts.inheritedDocuments, original.data.documents.length - 1)
  assert.equal(JSON.stringify(empty), before)
  const custom = structuredClone(empty)
  custom.data.documentOverrides[0].agentIds = [agent.id]
  assert.deepEqual(validate(custom).errors, [])
  custom.data.agents.find(a => a.id === agent.id).companyId = 'other-company'
  assert.ok(validate(custom).errors.some(error => error.includes('different company')))
  const duplicate = structuredClone(original)
  duplicate.data.bases.push(duplicate.data.bases[0])
  assert.ok(validate(duplicate).errors.some(error => error.includes('Duplicate ID')))
  const missing = structuredClone(empty)
  missing.data.documentOverrides[0].documentId = 'missing-doc'
  assert.ok(validate(missing).errors.some(error => error.includes('missing')))
  const malformed = structuredClone(original)
  malformed.data.agents = [null, { id: [], model: null }]
  assert.ok(validate(malformed).errors.length > 0)
  assert.ok(validate(null).errors.length)
  const broken = structuredClone(empty)
  broken.data.documentOverrides[0].agentIds = null
  assert.ok(validate(broken).errors.some(error => error.includes('Expected an ID array')))
  console.log('PASS: valid snapshot, empty/nonempty/inherited overrides, cross-company rejection, duplicate/missing IDs, malformed input and no mutation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
