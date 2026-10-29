// Mock fetch only. No server, database or model connections.
const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const result = await build({
    entryPoints: ['src/modules/ai/assistant/services/toolChatService.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'fake-auth', setup(b) {
      b.onResolve({ filter: /^@\/stores\/authStore$/ }, () => ({ path: 'auth', namespace: 'fake' }))
      b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents:
        'export const useAuthStore = {getState: () => ({accessToken: globalThis.__toolToken})}' }))
    } }],
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const originalFetch = globalThis.fetch
  const input = { companyId: 'company-j1', providerId: 'bound-provider', modelId: 'bound/model', messages: [{ role: 'user', content: '2+3' }] }
  const snapshot = structuredClone(input)
  const requestId = 'request-123'
  let requests = []
  globalThis.__toolToken = 'backend_test-only'
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      return Response.json({ modelId: input.modelId, reply: '5' })
    }
    assert.equal(await api.sendToolChat(input, 'agent-1', requestId, new AbortController().signal), '5')
    assert.equal(requests.length, 1)
    const chat = requests[0]
    assert.equal(chat.url, '/api/ai/chat/messages/tools')
    assert.equal(chat.options.method, 'POST')
    assert.equal(chat.options.credentials, 'include')
    assert.equal(new Headers(chat.options.headers).get('Authorization'), 'Bearer backend_test-only')
    assert.equal(new Headers(chat.options.headers).get('X-AI-Tool-Request-Id'), requestId)
    assert.deepEqual(JSON.parse(chat.options.body), { ...input, agentId: 'agent-1' })
    assert.deepEqual(input, snapshot)
    globalThis.__toolToken = null
    await assert.rejects(api.sendToolChat(input, 'agent-1', requestId, new AbortController().signal), /Sign in/)
    assert.equal(requests.length, 1)
    globalThis.__toolToken = 'backend_test-only'
    console.log('PASS 1: authenticated chat preserves request ID, Agent and selected model; missing login sends nothing.')

    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      return Response.json({ message: 'cancelled' }, { status: 202 })
    }
    await api.cancelToolChat(input.companyId, 'agent-1', requestId)
    const cancel = requests.at(-1)
    assert.equal(cancel.url, '/api/ai/chat/messages/tools/cancel')
    assert.equal(new Headers(cancel.options.headers).get('Authorization'), 'Bearer backend_test-only')
    assert.equal(new Headers(cancel.options.headers).get('X-AI-Tool-Request-Id'), requestId)
    assert.deepEqual(JSON.parse(cancel.options.body), { companyId: input.companyId, agentId: 'agent-1' })
    console.log('PASS 2: cancellation carries matching authentication, request ID and scope.')

    for (const status of [401, 403, 502]) {
      let calls = 0
      globalThis.fetch = async url => {
        calls++
        assert.equal(url, '/api/ai/chat/messages/tools')
        return Response.json({ message: `Rejected ${status}` }, { status })
      }
      await assert.rejects(api.sendToolChat(input, 'agent-1', requestId, new AbortController().signal), new RegExp(`Rejected ${status}`))
      assert.equal(calls, 1)
    }
    console.log('PASS 3: 401/403/502 send one chat request; no automatic retry or fallback.')

    const controller = new AbortController()
    let calls = 0
    globalThis.fetch = async (url, options) => {
      calls++
      if (url.endsWith('/cancel')) {
        assert.notEqual(options.signal, controller.signal)
        assert.equal(options.signal.aborted, false)
        return Response.json({ message: 'cancelled' }, { status: 202 })
      }
      controller.abort()
      return Response.json({ modelId: input.modelId, reply: 'late answer' })
    }
    await assert.rejects(api.sendToolChat(input, 'agent-1', requestId, controller.signal), { name: 'AbortError' })
    await api.cancelToolChat(input.companyId, 'agent-1', requestId)
    assert.equal(calls, 2)
    console.log('PASS 4: aborted chat rejects late reply; independent cancellation can still be sent.')
  } finally {
    globalThis.fetch = originalFetch
    delete globalThis.__toolToken
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
