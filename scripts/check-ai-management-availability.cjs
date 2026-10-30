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
      export * from './src/modules/ai/settings/services/toolApiService.ts';
      export * from './src/modules/ai/settings/components/ToolOverview.tsx';
      export * from './src/modules/ai/agents/components/AgentModelSummary.tsx';
      export {ai as en} from './src/i18n/locales/en/ai.ts';
      export {ai as zh} from './src/i18n/locales/zh-CN/ai.ts';` },
    jsx: 'automatic', bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-router-dom'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^react-i18next$/ }, () => ({path:'translation',namespace:'fake'}))
      b.onResolve({ filter: /^@\/services\/httpClient$/ }, () => ({path:'http',namespace:'fake'}))
      b.onResolve({ filter: /\/services\/agentService$/ }, () => ({path:'agents',namespace:'fake'}))
      b.onResolve({ filter: /^\.\/(ToolAgentsDrawer|ToolUsage|SettingsDrawer)$/ }, ({path:p}) => ({path:p.slice(2),namespace:'fake'}))
      b.onResolve({filter:/^@\//}, args=>b.resolve('./src/'+args.path.slice(2), {resolveDir:process.cwd(),kind:args.kind}))
      b.onLoad({ filter: /.*/, namespace:'fake' }, ({path:p}) => ({contents:
        p==='translation' ? `export const useTranslation=()=>({t:(key,fallback)=>globalThis.__availabilityLocale[key]??fallback??key});` :
        p==='http' ? `export class ApiError extends Error {}; export const apiRequest=(...args)=>globalThis.__availabilityApi(...args);` :
        p==='agents' ? `export const fetchAgents=async()=>({items:[]});` :
        p==='SettingsDrawer' ? `export const SettingsDrawer=()=>null;` : `export const ${p}=()=>null;`
      }))
    }}],
  })
  const filename=path.join(process.cwd(),'scripts/availability-bundle.cjs')
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(bundle.outputFiles[0].text,filename)
  const api=m.exports
  const originalFetch=globalThis.fetch
  globalThis.fetch=()=>{throw Error('Network is prohibited in this check')}
  const row={id:'tool-1',companyId:'company-j1',name:'Calculator',description:'Test',module:'Utility',action:'calc.run',executorType:'calculator',risk:'low',status:'disabled',timeoutSeconds:30,requiresConfirmation:false,configuration:{},version:1,agentIds:[]}
  const renderTool=tool=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(api.ToolOverview,{tool,onEdit(){},onAction(){},onSaved(){}})))
  try {
    globalThis.__availabilityLocale=api.en
    for(const state of ['supported','not_implemented','unsupported_configuration',undefined,'future-state']){
      globalThis.__availabilityApi=async()=>({items:[{...row,executionSupport:state,executionSupportReason:'Server reason'}]})
      const [tool]=await api.fetchStoredTools('company-j1')
      const known=['supported','not_implemented','unsupported_configuration'].includes(state)
      assert.equal(tool.executionSupport,known?state:undefined)
      assert.equal(tool.status,'disabled')
      const html=renderTool(tool)
      assert(html.includes(api.en['ai.tools.executionSupport.'+(known?state:'unknown')]))
      assert(html.includes(api.en['ai.tools.executionSupport.'+(known?state:'unknown')]))
      assert(html.includes(api.en['ai.tools.executionSupport.label']))
      assert(!html.includes('Server reason')) // Display localised fixed descriptions.
    }
    globalThis.__availabilityApi=async()=>({...row,executionSupport:'supported'})
    assert.equal((await api.fetchStoredTool('company-j1','tool-1')).executionSupport,'supported')
    console.log('PASS: real Tools list/detail mapping, all support states, safe unknown fallback, status independence and rendered descriptions.')
    const options=[{id:'config-1',providerId:'provider-1',modelId:'test/model',name:'Test',label:'Bound model name'}]
    const config={provider:'auto',model:'',binding:{providerId:'provider-1',modelConfigId:'config-1'},temperature:.3,topP:1,maxTokens:512}
    const base={companyId:'company-j1',check:{companyId:'company-j1',state:'ready'},config,options}
    const cases=[
      [base,'bound'],
      [{...base,check:{companyId:'company-j1',state:'loading'}},'checking'],
      [{...base,check:{companyId:'company-j1',state:'error'}},'checkFailed'],
      [{...base,check:{companyId:'company-j2',state:'error'}},'checking'],
      [{...base,options:[]},'unavailable'],
      [{...base,config:{...config,binding:{...config.binding,providerId:'other-provider'}}},'unavailable'],
      [{...base,config:undefined},'auto'],
      [{...base,config:undefined,options:[]},'noModel'],
      [{...base,config:{...config,binding:undefined,provider:'openai'}},'legacy'],
    ]
    for(const locale of [api.en,api.zh]){
      globalThis.__availabilityLocale=locale
      for(const [props,state] of cases){
        assert.equal(api.agentModelAvailability(props),state)
        const html=renderToStaticMarkup(React.createElement(api.AgentModelSummary,props))
        assert(html.includes(locale['ai.agents.modelAvailability.'+state]))
        if(['checking','checkFailed'].includes(state)){
          assert(!html.includes(locale['ai.agents.modelAvailability.unavailable']))
          assert(!html.includes('Bound model name'))
        }
        assert(html.includes('console-table__muted'))
      }
      const tool={...row,executionSupport:'supported',agents:[],activity:[],updatedAt:''}
      assert(renderTool(tool).includes(locale['ai.tools.executionSupport.label']))
    }
    const page=fs.readFileSync('src/modules/ai/agents/pages/AgentsPage.tsx','utf8')
    assert(page.includes('<AgentModelSummary companyId={companyId} check={modelCheck}'))
    for(const state of ['loading','ready','error'])assert(page.includes(`setModelCheck({ companyId, state: '${state}' })`))
    assert(page.includes('return () => { active = false }'))
    assert(!page.includes("?? (agent.model.binding ? 'Bound model unavailable'"))
    console.log('PASS: actual Agent rendering in EN/ZH: loading, failure, fixed binding, provider mismatch, Auto/no models, legacy and company-switch isolation; page wiring present.')
  } finally {
    globalThis.fetch=originalFetch
    delete globalThis.__availabilityApi
    delete globalThis.__availabilityLocale
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
