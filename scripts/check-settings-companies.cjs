// Headless service checks. No browser, screenshots, or application seed writes.
// Run: node scripts/check-settings-companies.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const modules = new Map()
const { createSettingsApi } = require('./helpers/ai-settings-test-api.cjs')
const api = createSettingsApi()
;['company-retail','company-wholesale','company-j1','company-j2','company-tokyo-izakaya'].forEach(api.seed)
const context = vm.createContext({
  console, structuredClone, URL, URLSearchParams, Intl, Date, crypto: require('node:crypto').webcrypto,
  fetch: (...args) => api.fetch(...args),
  window: {setTimeout: callback => setTimeout(callback, 0)},
})
function load(file) {
  if(file.endsWith('.css'))return {}
  let filename = path.resolve(root, file)
  if(!/\.tsx?$/.test(filename))filename=fs.existsSync(filename+'.ts')?filename+'.ts':filename+'.tsx'
  if (modules.has(filename)) return modules.get(filename).exports
  const module = {exports: {}}
  modules.set(filename, module)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText
  function localRequire(request) {
    if(!request.startsWith('.')&&!request.startsWith('@/'))return require(request)
    if (request === '@/modules/ai/agents/services/agentService') {
      // Assignment validation uses the real existing agent seeds, without auth/UI dependencies.
      return {fetchAgents: async companyId => ({items: load('src/modules/ai/mock/seed.ts').SEED_AGENTS.filter(agent => agent.companyId === companyId)})}
    }
    return load(request.startsWith('@/') ? 'src/' + request.slice(2) : path.resolve(path.dirname(filename), request))
  }
  const factory = vm.runInContext('(function(require,module,exports){' + source + '\n})', context, {filename})
  factory(localRequire, module, module.exports)
  return module.exports
}
const clean = value => JSON.parse(JSON.stringify(value))
module.exports={load,clean,api,mock(file,exports){modules.set(path.resolve(root,file),{exports})}}
if(require.main===module)require('./helpers/check-settings-companies-main.cjs')(module.exports).catch(error=>{console.error(error);process.exitCode=1})
