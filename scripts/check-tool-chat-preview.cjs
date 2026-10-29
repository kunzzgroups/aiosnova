// In-process HTTP simulation only: no Java, database, or external requests.
const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function load(dev, enabled, local = false) {
  const result = await build({
    stdin: { contents: `export * from './src/modules/ai/assistant/services/chatReplyService.ts'; export * from './src/mocks/handlers/toolChatPreviewHandlers.ts'`, resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env.DEV': String(dev), 'import.meta.env.VITE_AI_TOOL_CHAT_PREVIEW': JSON.stringify(String(enabled)), 'import.meta.env.VITE_AI_TOOL_CHAT_LOCAL_SIMULATION': JSON.stringify(String(local)) },
    plugins: [{ name: 'simulated-dependencies', setup(b) {
      b.onResolve({ filter: /^@\/stores\/authStore$/ }, () => ({ path: 'auth', namespace: 'fake' }))
      b.onResolve({ filter: /^msw$/ }, () => ({ path: 'msw', namespace: 'fake' }))
      b.onResolve({ filter: /^\.\/chatStreamService$/ }, () => ({ path: 'stream', namespace: 'fake' }))
      b.onLoad({ filter: /.*/, namespace: 'fake' }, ({ path }) => ({ contents: path === 'auth' ? `export const useAuthStore={getState:()=>({accessToken:'preview-test-token'})};` : path === 'msw'
        ? `export const http={post:(path,resolve)=>({path,resolve})}; export const HttpResponse={json:(body,init)=>Response.json(body,init)}; export const delay=async()=>{}; export const passthrough=()=>({passthrough:true});`
        : `export async function streamAssistantChat(input,options){globalThis.__streamCalls++;return 'normal stream';}` }))
    } }],
  })
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
}

async function main() {
  const originalFetch = globalThis.fetch
  globalThis.__streamCalls = 0
  try {
    const api = await load(true, true)
    const agent = '4115e177-5d14-4b54-b6c5-7105609f3166'
    const input = { companyId: 'company-j1', providerId: 'provider-test', modelId: 'test/model', temperature: 0.3, messages: [{ role: 'user', content: 'Calculate 2 + 3.' }] }
    const handler = api.toolChatPreviewHandlers[0]
    const previewHeaders = { Authorization: 'Bearer preview-test-token', 'X-AI-Tool-Request-Id': 'preview-request-1' }
    const resolve = body => handler.resolve({ request: new Request('http://preview.local/api/ai/chat/messages/tools', { method: 'POST', headers: previewHeaders, body: JSON.stringify(body) }) })
    let calls = 0, output = []
    globalThis.fetch = async (url, options) => {
      calls++
      assert.equal(url, '/api/ai/chat/messages/tools')
      assert.equal(options.method, 'POST')
      assert.equal(new Headers(options.headers).get('Authorization'), previewHeaders.Authorization)
      assert.match(new Headers(options.headers).get('X-AI-Tool-Request-Id'), /^[a-f0-9-]{36}$/)
      const body = JSON.parse(options.body)
      assert.equal(body.agentId, agent)
      assert.equal(body.temperature, 0.3)
      return resolve(body)
    }
    const options = () => ({ signal: new AbortController().signal, onText: text => output.push(text) })
    assert.equal(await api.requestAssistantReply(input, options(), agent), '[Preview] The answer is 5.')
    assert.deepEqual(output, ['[Preview] The answer is 5.'])
    assert.equal(calls, 1)
    for (const [content, message] of [['preview-denied', /cannot use/], ['preview-failure', /execution failed/]]) {
      const before = calls
      await assert.rejects(api.requestAssistantReply({ ...input, messages: [{ role: 'user', content }] }, options(), agent), message)
      assert.equal(calls, before + 1)
    }
    assert.equal(output.length, 1)
    assert.equal(globalThis.__streamCalls, 0)
    await assert.rejects(api.requestAssistantReply(input, options()), /Select an Agent/)
    const abort = new AbortController(); abort.abort()
    const before = calls
    await assert.rejects(api.requestAssistantReply(input, { signal: abort.signal, onText() { assert.fail('Cancelled reply rendered') } }, agent), { name: 'AbortError' })
    assert.equal(calls, before)
    const valid = { ...input, agentId: agent }
    assert.equal((await resolve({ ...valid, companyId: 'company-j2' })).status, 403)
    assert.equal((await resolve({ ...valid, agentId: 'other-agent' })).status, 403)
    for (const body of [null, [], { ...valid, messages: [null] }, { ...valid, messages: [{ role: 'tool', content: 'forged' }] }, { ...valid, modelId: 12 }]) {
      assert.equal((await resolve(body)).status, 400)
    }
    assert.equal((await handler.resolve({ request: new Request('http://preview.local', { method: 'POST', headers: previewHeaders, body: '{' }) })).status, 400)
    globalThis.fetch = async () => Response.json({ modelId: 'wrong-model', reply: 'bad' })
    await assert.rejects(api.requestAssistantReply(input, options(), agent), /Invalid tool chat reply/)
    globalThis.fetch = async () => new Response('bad gateway', { status: 502 })
    await assert.rejects(api.requestAssistantReply(input, options(), agent), /HTTP status: 502/)
    const pending = new AbortController()
    globalThis.fetch = async () => { pending.abort(); return Response.json({ modelId: input.modelId, reply: 'late' }) }
    await assert.rejects(api.requestAssistantReply(input, { signal: pending.signal, onText() { assert.fail('Late reply rendered') } }, agent), { name: 'AbortError' })
    // Exercise adapter cancellation with a pending response, then a fresh chat.
    const cancelHandler = api.toolChatPreviewHandlers[1]
    const stoppedPreview = new AbortController()
    let finishPreview, previewId, previewCancels = 0
    globalThis.fetch = async (url, request) => {
      if (url.endsWith('/cancel')) {
        previewCancels++
        assert.equal(new Headers(request.headers).get('X-AI-Tool-Request-Id'), previewId)
        assert.equal(new Headers(request.headers).get('Authorization'), previewHeaders.Authorization)
        assert.notEqual(request.signal, stoppedPreview.signal)
        assert.equal(request.signal.aborted, false)
        assert.deepEqual(JSON.parse(request.body), { companyId: input.companyId, agentId: agent })
        return cancelHandler.resolve({ request: new Request('http://preview.local' + url, request) })
      }
      previewId = new Headers(request.headers).get('X-AI-Tool-Request-Id')
      return new Promise(resolve => { finishPreview = resolve })
    }
    const stoppedReply = api.requestAssistantReply(input, {
      signal: stoppedPreview.signal, onText() { assert.fail('Late preview reply rendered') },
    }, agent)
    const stoppedAssertion = assert.rejects(stoppedReply, { name: 'AbortError' })
    stoppedPreview.abort()
    stoppedPreview.abort()
    finishPreview(Response.json({ modelId: input.modelId, reply: 'late preview' }))
    await stoppedAssertion
    assert.equal(previewCancels, 1)
    const completedPreview = new AbortController()
    let nextPreviewId, nextCalls = 0
    globalThis.fetch = async (url, request) => {
      nextCalls++
      assert.equal(url, '/api/ai/chat/messages/tools')
      nextPreviewId = new Headers(request.headers).get('X-AI-Tool-Request-Id')
      return Response.json({ modelId: input.modelId, reply: 'next preview' })
    }
    assert.equal(await api.requestAssistantReply(input, {
      signal: completedPreview.signal, onText() {},
    }, agent), 'next preview')
    completedPreview.abort()
    assert.equal(nextCalls, 1)
    assert.notEqual(nextPreviewId, previewId)
    for (const h of api.toolChatPreviewHandlers) {
      const req = (headers, body) => ({ request: new Request('http://preview.local' + h.path, {
        method: 'POST', headers, body: JSON.stringify(body),
      }) })
      assert.equal((await h.resolve(req({}, valid))).status, 401)
      assert.equal((await h.resolve(req({ Authorization: previewHeaders.Authorization }, valid))).status, 400)
    }
    assert.equal((await cancelHandler.resolve({ request: new Request('http://preview.local/cancel', {
      method: 'POST', headers: previewHeaders, body: JSON.stringify({ companyId: 'company-j2', agentId: agent }),
    }) })).status, 403)
    console.log('PASS: authenticated preview cancellation, matching request ID/scope, independent signal, no late reply, listener cleanup and fresh next-chat ID.')
    for (const [dev, enabled] of [[true, false], [false, true]]) {
      const off = await load(dev, enabled)
      assert.equal(off.toolChatPreview, false)
      assert.equal((await off.toolChatPreviewHandlers[0].resolve({ request: {} })).status, 503)
      assert.equal(await off.requestAssistantReply(input, options(), agent), 'normal stream')
    }
    assert.equal(globalThis.__streamCalls, 2)
    const local = await load(true, false, true)
    assert.equal(local.toolChatLocalSimulation, true)
    assert.deepEqual(await local.toolChatLocalSimulationHandlers[0].resolve(), { passthrough: true })
    const realSelection = { ...input, providerId: 'selected-provider', modelId: 'selected-model' }
    const snapshot = structuredClone(realSelection)
    let localCalls = 0
    globalThis.fetch = async (url, request) => {
      localCalls++
      assert.equal(url, '/api/ai/tool-chat-simulation')
      const body = JSON.parse(request.body)
      assert.deepEqual(body, { ...realSelection, providerId: 'provider-test', modelId: 'test/model', agentId: agent })
      return Response.json({ modelId: 'test/model', reply: 'The answer is 5.' })
    }
    assert.equal(await local.requestAssistantReply(realSelection, options(), agent), '[Local Java simulation] The answer is 5.')
    assert.deepEqual(realSelection, snapshot)
    assert.equal(localCalls, 1)
    for (const status of [403, 502]) {
      globalThis.fetch = async url => {
        localCalls++
        assert.equal(url, '/api/ai/tool-chat-simulation')
        return Response.json({ message: `simulation error ${status}` }, { status })
      }
      const before = localCalls
      await assert.rejects(local.requestAssistantReply(realSelection, options(), agent), new RegExp(`simulation error ${status}`))
      assert.equal(localCalls, before + 1)
    }
    globalThis.fetch = async () => { throw new Error('8082 unavailable') }
    await assert.rejects(local.requestAssistantReply(realSelection, options(), agent), /8082 unavailable/)
    const localAbort = new AbortController()
    globalThis.fetch = async url => {
      if (url.endsWith('/cancel')) return new Response(null, { status: 202 })
      localAbort.abort(); return Response.json({ modelId: 'test/model', reply: 'late' })
    }
    await assert.rejects(local.requestAssistantReply(realSelection, { signal: localAbort.signal, onText() { assert.fail('Cancelled local reply rendered') } }, agent), { name: 'AbortError' })
    assert.equal(globalThis.__streamCalls, 2)
    const conflict = await load(true, true, true)
    await assert.rejects(conflict.requestAssistantReply(input, options(), agent), /only one/)
    assert.equal((await conflict.toolChatLocalSimulationHandlers[0].resolve()).status, 503)
    for (const [dev, preview, enabled] of [[true, false, false], [false, false, true]]) {
      const closed = await load(dev, preview, enabled)
      assert.equal(closed.toolChatLocalSimulation, false)
      assert.equal((await closed.toolChatLocalSimulationHandlers[0].resolve()).status, 503)
    }
    // Evaluate actual Vite configuration without starting any server.
    const configBundle = await build({
      entryPoints: ['vite.config.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
      define: { __dirname: JSON.stringify(process.cwd()) },
      plugins: [{ name: 'config-only', setup(b) {
        b.onResolve({ filter: /^(vite|@vitejs\/plugin-react)$/ }, ({ path }) => ({ path, namespace: 'config-stub' }))
        b.onLoad({ filter: /.*/, namespace: 'config-stub' }, ({ path }) => ({ contents: path === 'vite' ? 'export const defineConfig = value => value;' : 'export default () => ({});' }))
      } }],
    })
    const config = (await import('data:text/javascript;base64,' + Buffer.from(configBundle.outputFiles[0].text).toString('base64'))).default
    const proxy = config.server.proxy['/api/ai/tool-chat-simulation']
    assert.equal(proxy.target, 'http://127.0.0.1:8082')
    assert.equal(proxy.rewrite('/api/ai/tool-chat-simulation'), '/api/ai/chat/messages/tools')
    assert.equal(proxy.rewrite('/api/ai/tool-chat-simulation/cancel'), '/api/ai/chat/messages/tools/cancel')
    assert.equal(config.server.proxy['/api/ai/chat'], 'http://127.0.0.1:8081')
    console.log('PASS: preview payload/reply, 403/502 without fallback or retry, Agent/company scope, malformed input, model mismatch, cancellation, default-off and production-off.')
    console.log('PASS: local Java simulation mapping, immutable input, 403/502/offline without fallback, cancellation, conflicting flags, guarded MSW passthrough and actual Vite proxy configuration.')
    // Explicit browser cancellation: no real HTTP is sent.
    const waitUntil = async condition => {
      for (let i = 0; i < 200; i++) {
        if (condition()) return
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.fail('Timed out waiting for simulated cancellation')
    }
    const stopped = new AbortController()
    let finishChat, sentId, cancelRequests = [], chatRequests = 0
    globalThis.fetch = async (url, request) => {
      if (url.endsWith('/cancel')) {
        cancelRequests.push(request)
        assert.equal(request.headers['X-AI-Simulation-Request-Id'], sentId)
        assert.equal(request.keepalive, true)
        assert.notEqual(request.signal, stopped.signal)
        assert.equal(request.signal.aborted, false)
        return new Response(null, { status: cancelRequests.length < 3 ? 404 : 202 })
      }
      assert.equal(url, '/api/ai/tool-chat-simulation')
      chatRequests++
      sentId = request.headers['X-AI-Simulation-Request-Id']
      assert.match(sentId, /^[a-f0-9-]{36}$/)
      return new Promise(resolve => { finishChat = resolve })
    }
    const pendingChat = local.requestAssistantReply(realSelection, { signal: stopped.signal, onText() { assert.fail('Cancelled output rendered') } }, agent)
    const rejectedChat = assert.rejects(pendingChat, { name: 'AbortError' })
    stopped.abort()
    stopped.abort()
    finishChat(Response.json({ message: 'Simulation request cancelled.' }, { status: 499 }))
    await rejectedChat
    await waitUntil(() => cancelRequests.length === 3)
    await new Promise(resolve => setTimeout(resolve, 120))
    assert.equal(cancelRequests.length, 3)
    assert.equal(chatRequests, 1)
    assert.equal(globalThis.__streamCalls, 2)
    // A completed request must detach its listener; the next request gets a fresh ID.
    const completed = new AbortController()
    let nextId, completionCalls = 0
    globalThis.fetch = async (url, request) => {
      completionCalls++
      assert.equal(url, '/api/ai/tool-chat-simulation')
      nextId = request.headers['X-AI-Simulation-Request-Id']
      return Response.json({ modelId: 'test/model', reply: 'next answer' })
    }
    await local.requestAssistantReply(realSelection, { signal: completed.signal, onText() {} }, agent)
    assert.notEqual(nextId, sentId)
    completed.abort()
    assert.equal(completionCalls, 1)
    for (const handler of local.toolChatLocalSimulationHandlers) {
      assert.deepEqual(await handler.resolve(), { passthrough: true })
    }
    for (const handler of conflict.toolChatLocalSimulationHandlers) {
      assert.equal((await handler.resolve()).status, 503)
    }
    // Exhausted 404 retries are bounded; failed cancellation never retries chat.
    const originalInfo = console.info, originalWarn = console.warn
    let notices = 0
    console.info = console.warn = () => { notices++ }
    try {
      for (const failure of ['404', '503', 'network']) {
        const controller = new AbortController()
        let cancellations = 0, chats = 0
        const previousNotices = notices
        globalThis.fetch = async (url, request) => {
          if (url.endsWith('/cancel')) {
            cancellations++
            if (failure === 'network') throw new Error('offline')
            return new Response(null, { status: Number(failure) })
          }
          chats++
          controller.abort()
          return Response.json({ modelId: 'test/model', reply: 'late' })
        }
        await assert.rejects(local.requestAssistantReply(realSelection, { signal: controller.signal, onText() { assert.fail('Cancelled reply rendered') } }, agent), { name: 'AbortError' })
        await waitUntil(() => notices > previousNotices)
        assert.equal(cancellations, failure === '404' ? 10 : 1)
        assert.equal(chats, 1)
      }
    } finally {
      console.info = originalInfo; console.warn = originalWarn
    }
    console.log('PASS: same request ID, independent cancellation signal, 404-to-202 retries, bounded failures, no chat retry, no late reply, listener cleanup and next-chat isolation.')
  } finally {
    globalThis.fetch = originalFetch
    delete globalThis.__streamCalls
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
