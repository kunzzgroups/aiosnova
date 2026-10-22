const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const storage = new Map()
  let events = 0
  globalThis.window = {
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    dispatchEvent: () => { events++ },
  }
  const bundle = await build({
    entryPoints: ['src/modules/ai/settings/services/modelProviderSelection.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node',
  })
  const url = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  const service = await import(url)
  const ids = ['chat-test', 'openrouter']
  service.rememberModelProvider('company-j1', 'openrouter')
  assert.equal(service.chooseModelProvider('company-j1', ids), 'openrouter')
  service.rememberModelProvider('company-j1', 'openrouter')
  assert.equal(events, 1, 'Unchanged selection does not cause event loops')
  const reloaded = await import(url + '#reload')
  assert.equal(reloaded.chooseModelProvider('company-j1', ids), 'openrouter', 'Refresh preserves selection')
  assert.equal(service.chooseModelProvider('company-j2', ids), 'chat-test', 'Companies have independent selection')
  assert.equal(service.chooseModelProvider('company-j1', ids, 'chat-test'), 'chat-test', 'Explicit route takes priority')
  assert.equal(service.chooseModelProvider('company-j1', ['remaining']), 'remaining', 'Deleted provider is not selected')
  assert.equal(service.chooseModelProvider('company-j1', []), '')
  window.sessionStorage.getItem = () => { throw new Error('Storage blocked') }
  window.sessionStorage.setItem = () => { throw new Error('Storage blocked') }
  service.rememberModelProvider('company-j3', 'openrouter')
  assert.equal(service.chooseModelProvider('company-j3', ids), 'openrouter')
  console.log('PASS: remembered provider, refresh, company isolation, explicit route, removed provider, empty list, event guard, storage fallback')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
