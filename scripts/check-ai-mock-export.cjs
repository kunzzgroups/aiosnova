// Offline: verify a live snapshot survives JSON serialization without losing empty overrides.
const assert = require('node:assert/strict')
const { build } = require('esbuild')
async function main() {
  const result = await build({
    stdin: { contents: "export * from './src/modules/ai/mock/exportSnapshot.ts'; export { getMockState } from './src/modules/ai/mock/mockStore.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false,
    alias: { '@': require('node:path').resolve('src') },
    define: { 'import.meta.env.DEV': 'true' },
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const state = api.getMockState()
  state.agents[0].name = 'Live edited Agent'
  state.documentOverrides.clear()
  state.documentOverrides.set('doc-empty', [])
  state.documentOverrides.set('doc-custom', [state.agents[0].id])
  const before = JSON.stringify({ ...state, documentOverrides: [...state.documentOverrides] })
  const snapshot = api.createMockSnapshot()
  const restored = JSON.parse(JSON.stringify(snapshot))
  assert.equal(restored.schemaVersion, 1)
  assert.equal(restored.scope, 'all-mock-companies')
  assert.equal(restored.data.agents[0].name, 'Live edited Agent')
  for (const field of ['agents', 'bases', 'documents', 'skills', 'dataSources', 'templates']) {
    assert.deepEqual(restored.data[field], JSON.parse(JSON.stringify(state[field])))
  }
  assert.deepEqual(restored.data.documentOverrides, [
    { documentId: 'doc-empty', agentIds: [] },
    { documentId: 'doc-custom', agentIds: [state.agents[0].id] },
  ])
  assert.equal(restored.counts.emptyDocumentOverrides, 1)
  assert.equal(restored.data.documentOverrides.some(item => item.documentId === 'doc-inherited'), false)
  snapshot.data.agents[0].knowledgeBaseIds.push('snapshot-only')
  snapshot.data.documentOverrides[1].agentIds.push('snapshot-only')
  assert.equal(JSON.stringify({ ...state, documentOverrides: [...state.documentOverrides] }), before)
  console.log('PASS: live data, original IDs/model/base links, visibility, all content metadata, empty/nonempty/absent overrides, JSON round trip and no store mutation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
