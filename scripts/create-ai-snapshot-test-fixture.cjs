// Generate test data from seeds only. Never reads the user's exported backup.
const { build } = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
async function main() {
  const result = await build({ stdin: { contents: "export { createMockSnapshot } from './src/modules/ai/mock/exportSnapshot.ts'", resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'node', write: false, alias: { '@': path.resolve('src') }, define: { 'import.meta.env.DEV': 'true' } })
  const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  const snapshot = api.createMockSnapshot()
  for (const agent of snapshot.data.agents) agent.model = { provider: 'auto', model: '', temperature: 0.3, topP: 1, maxTokens: 2048 }
  fs.mkdirSync('server/target', { recursive: true })
  fs.writeFileSync('server/target/ai-snapshot-validation-fixture.json', JSON.stringify(snapshot))
  console.log('Generated seed-only snapshot fixture in server/target.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
