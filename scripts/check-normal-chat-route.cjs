// Offline routing check: fetch is replaced; no backend or model is called.
const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  const result = await build({
    entryPoints: ['src/modules/ai/assistant/services/chatReplyService.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'offline-auth', setup(b) {
      b.onResolve({ filter: /^@\/stores\/authStore$/ }, () => ({ path: 'auth', namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const useAuthStore={getState(){throw new Error("Normal chat must not read tool authentication")}}' }))
    } }],
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.VITE_AI_TOOL_CHAT_PREVIEW': '"false"',
      'import.meta.env.VITE_AI_TOOL_CHAT_LOCAL_SIMULATION': '"false"',
    },
  })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const original = globalThis.fetch
  let calls = 0
  const input = { companyId: 'company-j1', providerId: 'provider-selected', modelId: 'model-selected', temperature: 0.3, messages: [{ role: 'user', content: 'Hello' }] }
  try {
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(url, '/api/ai/chat/stream')
      assert.deepEqual(JSON.parse(init.body), input)
      return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    }
    for (const agent of [undefined, 'selected-agent']) {
      const output = []
      assert.equal(await api.requestAssistantReply(input, { signal: new AbortController().signal, onText: text => output.push(text) }, agent), 'OK')
      assert.equal(output.at(-1), 'OK')
    }
    assert.equal(calls, 2)
    console.log('PASS: Auto and selected Agent use the real stream adapter; selected company/model/temperature preserved; no tool preview requests.')
  } finally { globalThis.fetch = original }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
