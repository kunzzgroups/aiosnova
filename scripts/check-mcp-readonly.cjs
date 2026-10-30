// Offline API mapping, rendered read-only UI and loading lifecycle checks.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')
const { build } = require('esbuild')

async function main() {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      export * from './src/modules/ai/settings/services/mcpApiService.ts';
      export {McpPage} from './src/modules/ai/settings/pages/McpPage.tsx';
      export {McpConnectionCheck} from './src/modules/ai/settings/components/McpConnectionCheck.tsx';` },
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'offline-mcp', setup(b) {
      b.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('McpPage.tsx')
        ? { path: 'page-react', namespace: 'offline' } : undefined)
      b.onResolve({ filter: /^@\/services\/httpClient$/ }, () => ({ path: 'http', namespace: 'offline' }))
      b.onResolve({ filter: /^react-i18next$/ }, () => ({ path: 'translation', namespace: 'offline' }))
      b.onResolve({ filter: /^@\/stores\/companyStore$/ }, () => ({ path: 'company', namespace: 'offline' }))
      b.onResolve({ filter: /(?:^|\/)mcpService$/ }, () => ({ path: 'mock-writes', namespace: 'offline' }))
      b.onResolve({ filter: /^@\// }, args => b.resolve('./src/' + args.path.slice(2),
        { resolveDir: process.cwd(), kind: args.kind }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, ({ path: p }) => ({ contents:
        p === 'http' ? `export class ApiError extends Error {}; export const apiRequest=(...args)=>globalThis.__mcpApi(...args);` :
        p === 'translation' ? `export const useTranslation=()=>({t:(key,fallback)=>fallback??key});` :
        p === 'company' ? `export const useCompanyStore=Object.assign(fn=>fn({companyId:globalThis.__mcpCompany}),{getState:()=>({companyId:globalThis.__mcpCompany})});` :
        p === 'page-react' ? `
          export const useState=value=>globalThis.__mcpState(value);
          export const useEffect=fn=>globalThis.__mcpEffects.push(fn);
          export const useMemo=fn=>fn();
          export const useRef=value=>({current:value});` :
        `const blocked=()=>{throw new Error('Mock mutation must never execute')};
         export const saveMcpServer=blocked,saveMcpAccess=blocked,refreshMcpCapabilities=blocked,
           removeMcpServers=blocked,testMcpServer=blocked,toggleMcpServer=blocked;`
      }))
    }}],
  })
  const filename = path.join(process.cwd(), 'scripts/mcp-readonly-bundle.cjs')
  const m = new Module(filename, module)
  m.filename = filename
  m.paths = Module._nodeModulePaths(path.dirname(filename))
  m._compile(bundle.outputFiles[0].text, filename)
  const api = m.exports
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw Error('Real network is forbidden') }
  const server = {
    id: 'server-1', companyId: 'company-j1', merchantId: 'merchant-acme',
    name: 'Stored MCP', description: 'Stored description', endpointUrl: 'http://127.0.0.1:19091/mcp',
    transport: 'streamable_http', protocolVersion: '2025-11-25', authType: 'none',
    enabled: false, timeoutSeconds: 30, connectionRevision: 1,
    verificationStatus: 'verified', verificationRevision: 1, version: 6,
  }
  const tool = {
    id: 'tool-1', companyId: 'company-j1', serverId: 'server-1', remoteName: 'calculator.add',
    description: 'Stored tool', inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    enabled: true, available: true, discoveredConnectionRevision: 1, version: 1,
  }
  let rows, tools, requests, fail
  function reset() {
    rows = [structuredClone(server)]; tools = [structuredClone(tool)]; requests = []; fail = null
    globalThis.__mcpApi = async (url, options) => {
      requests.push({ url, options })
      assert.equal(options.auth, true)
      assert.equal(options.cache, 'no-store')
      assert.equal(options.method ?? 'GET', 'GET')
      if (fail) throw fail
      if (url === '/api/ai/mcp/servers?companyId=company-j1') return { items: structuredClone(rows) }
      if (url === '/api/ai/mcp/servers/server-1/tools?companyId=company-j1') return { items: structuredClone(tools) }
      if (url === '/api/ai/mcp/servers?companyId=company-j2') return { items: [] }
      throw Error('Unexpected path: ' + url)
    }
  }
  function renderPage(items, { loading = false, error = null, status = 'all' } = {}) {
    let stateIndex = 0
    const values = new Map([[0, items], [1, loading], [2, error], [6, status], [7, items[0]?.id ?? '']])
    const updates = []
    globalThis.__mcpCompany = 'company-j1'
    globalThis.__mcpEffects = []
    globalThis.__mcpState = initial => {
      const index = stateIndex++
      return [values.has(index) ? values.get(index) : initial,
        value => updates.push({ index, value })]
    }
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(api.McpPage)))
    return { html, updates, effects: [...globalThis.__mcpEffects] }
  }
  const tick = () => new Promise(resolve => setImmediate(resolve))
  try {
    reset()
    assert.equal(api.MCP_READ_ONLY, true)
    let [mapped] = await api.fetchMcpServers('company-j1')
    assert.equal(mapped.status, 'disabled')
    assert.equal(mapped.verificationStatus, 'verified')
    assert.equal(mapped.dataSource, 'database')
    assert.equal(mapped.version, 6)
    assert.equal(mapped.secret, '')
    assert.equal(mapped.latency, null)
    assert.equal(mapped.capabilities[0].name, 'calculator.add')
    assert.equal(mapped.capabilities[0].enabled, true)
    assert.deepEqual(mapped.agents, [])
    assert.deepEqual(mapped.activity, [])
    assert.equal(requests.length, 2)
    assert.deepEqual((await api.fetchMcpTools('company-j1', 'server-1'))[0].inputSchema, tool.inputSchema)
    for (const [verification, expected] of [['verified', 'connected'], ['failed', 'error'], ['not_verified', 'not_verified']]) {
      rows[0].enabled = true; rows[0].verificationStatus = verification
      assert.equal((await api.fetchMcpServers('company-j1'))[0].status, expected)
    }
    for (const changed of [{ available: false }, { enabled: false }, { discoveredConnectionRevision: 0 }]) {
      tools = [{ ...structuredClone(tool), ...changed }]
      assert.equal((await api.fetchMcpServers('company-j1'))[0].capabilities[0].enabled, false)
    }
    console.log('PASS: database field/schema mapping, independent verification/status, tool availability and connection revision.')

    reset(); rows = []
    assert.deepEqual(await api.fetchMcpServers('company-j1'), [])
    assert.equal(requests.length, 1)
    assert.deepEqual(await api.fetchMcpServers('company-j2'), [])
    reset(); tools = []
    assert.deepEqual((await api.fetchMcpServers('company-j1'))[0].capabilities, [])
    const before = requests.length
    await assert.rejects(() => api.fetchMcpServers('bad.company'), /valid company/)
    await assert.rejects(() => api.fetchMcpTools('company-j1', 'bad/server'), /server ID/)
    assert.equal(requests.length, before)
    reset(); rows[0].companyId = 'company-j2'
    await assert.rejects(() => api.fetchMcpServers('company-j1'), /Invalid stored/)
    assert.equal(requests.length, 1)
    for (const changed of [{ companyId: 'company-j2' }, { serverId: 'server-other' }, { inputSchema: [] }, { version: -1 }]) {
      reset(); tools = [{ ...tool, ...changed }]
      await assert.rejects(() => api.fetchMcpServers('company-j1'), /Invalid stored MCP tool/)
    }
    reset(); rows[0].verificationRevision = 0
    await assert.rejects(() => api.fetchMcpServers('company-j1'), /verification does not match/)
    for (const changed of [{ authType: 'oauth' }, { timeoutSeconds: 0 }, { version: Number.MAX_SAFE_INTEGER + 1 }]) {
      reset(); rows = [{ ...server, ...changed }]
      await assert.rejects(() => api.fetchMcpServers('company-j1'), /Invalid stored MCP server/)
    }
    reset(); rows.push({ ...server })
    await assert.rejects(() => api.fetchMcpServers('company-j1'), /Duplicate MCP server/)
    reset(); tools.push({ ...tool })
    await assert.rejects(() => api.fetchMcpServers('company-j1'), /Duplicate MCP tool/)
    reset(); fail = new Error('Backend unavailable')
    await assert.rejects(() => api.fetchMcpServers('company-j1'), /Backend unavailable/)
    console.log('PASS: empty data, company/server isolation, invalid responses, duplicates and failures without Mock fallback.')

    reset(); [mapped] = await api.fetchMcpServers('company-j1')
    const page = renderPage([mapped])
    assert(page.html.includes('Stored MCP') && page.html.includes('calculator.add'))
    assert(page.html.includes('Saved verification · Verified'))
    assert(!page.html.includes('Mock success') && !page.html.includes('Status · Sample'))
    for (const [verificationStatus, text] of [['failed', 'Failed'], ['not_verified', 'Not verified']]) {
      const html = renderToStaticMarkup(React.createElement(api.McpConnectionCheck, {
        server: { ...mapped, verificationStatus }, busy: false, checking: false, onCheck() {
          throw Error('Read-only connection check must not run')
        },
      }))
      assert(html.includes('Saved verification · ' + text))
      assert(!html.includes('Mock success'))
    }
    const buttons = [...page.html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    for (const name of ['Add MCP', 'Manage agents', 'Test connection']) {
      const button = buttons.find(([, , html]) => html.replace(/<[^>]*>/g, '').includes(name))
      assert(button, name + ' missing')
      assert(/\bdisabled(?:=|\s|$)/.test(button[1]), name + ' must be disabled')
    }
    for (const label of ['Delete MCP', 'Enable MCP', 'Refresh capabilities']) {
      const button = buttons.find(([, attrs]) => attrs.includes(`aria-label="${label}"`))
      assert(button && /\bdisabled(?:=|\s|$)/.test(button[1]), label + ' must be disabled')
    }
    const retryPage = renderPage([], { error: 'Backend unavailable' })
    const retry = [...retryPage.html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
      .find(([, , html]) => html.replace(/<[^>]*>/g, '') === 'Retry')
    assert(retry && !/\bdisabled(?:=|\s|$)/.test(retry[1]))
    assert(renderPage([], { loading: true }).html.includes('Loading MCP servers'))
    console.log('PASS: unchanged page structure, stored verification label, write controls disabled, loading/error/Retry available.')

    reset(); fail = new Error('Load failed')
    const failedLoad = renderPage([], { loading: true })
    failedLoad.effects[0]()
    const failedCleanup = failedLoad.effects[1]()
    await tick()
    assert(failedLoad.updates.some(update => update.index === 2 && update.value === 'Load failed'))
    failedCleanup()
    reset()
    const restored = renderPage([], { loading: true })
    restored.effects[0]()
    const restoredCleanup = restored.effects[1]()
    await tick()
    assert(restored.updates.some(update => update.index === 0 && update.value[0]?.id === 'server-1'))
    restoredCleanup()
    reset()
    let release
    globalThis.__mcpApi = () => new Promise(resolve => { release = resolve })
    const late = renderPage([], { loading: true })
    late.effects[0]()
    const cleanup = late.effects[1]()
    cleanup()
    release({ items: [] })
    await tick()
    assert(!late.updates.some(update => update.index === 0))
    console.log('PASS: load failure/recovery and stale response ignored after company workspace cleanup.')

    const pageSource = fs.readFileSync('src/modules/ai/settings/pages/McpPage.tsx', 'utf8')
    assert(pageSource.includes("import { fetchMcpServers, MCP_READ_ONLY } from '../services/mcpApiService'"))
    for (const guard of ['if(MCP_READ_ONLY||working.current)return', 'if(MCP_READ_ONLY||!pending||working.current)return', 'if(MCP_READ_ONLY)return']) {
      assert(pageSource.includes(guard), 'Missing programmatic write guard: ' + guard)
    }
    const vite = fs.readFileSync('vite.config.ts', 'utf8')
    assert(vite.includes("'/api/ai/mcp': 'http://127.0.0.1:8081'"))
    const browser = fs.readFileSync('src/mocks/browser.ts', 'utf8')
    for (const route of ['/api/ai/mcp/servers', '/api/ai/mcp/servers/:id', '/api/ai/mcp/servers/:id/tools']) {
      assert(browser.includes(`http.get('${route}', () => passthrough())`))
    }
    console.log('PASS: page API source, defensive write guards, Vite 8081 proxy and three GET passthrough declarations.')
  } finally {
    globalThis.fetch = originalFetch
    for (const key of ['__mcpApi', '__mcpCompany', '__mcpState', '__mcpEffects']) delete globalThis[key]
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
