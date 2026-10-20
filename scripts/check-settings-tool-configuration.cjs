const assert=require('node:assert/strict')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {load,clean,mock}=require('./check-settings-companies.cjs')
// Render form content headlessly; portals are replaced only in this test harness.
mock('src/modules/ai/settings/components/SettingsDrawer.tsx',{
  SettingsDrawer:({open,children,footer})=>open?React.createElement('section',null,children,footer):null,
})
const config=load('src/modules/ai/settings/services/toolConfiguration.ts')
const tools=load('src/modules/ai/settings/services/toolsService.ts')
const usage=load('src/modules/ai/settings/services/usageService.ts')
const {toolUsageSeries}=load('src/modules/ai/settings/services/toolUsageSeries.ts')
const {ToolUsage}=load('src/modules/ai/settings/components/ToolUsage.tsx')
const {ToolDrawer}=load('src/modules/ai/settings/components/ToolDrawer.tsx')
const companies=['company-retail','company-wholesale','company-j1','company-j2','company-tokyo-izakaya']

async function main(){
  for(const company of companies){
    const records=await usage.fetchUsageRecords(company)
    const entries=await tools.fetchTools(company)
    for(const tool of entries){
      assert.deepEqual(clean(config.validateToolConfiguration(tool.action,tool.configuration)),{})
      const fields=config.toolConfigurationFields(tool.action)
      if(tool.action==='calc.run'){
        assert.equal(fields.length,0)
        assert.equal(Object.keys(tool.configuration).length,0)
      }else assert(fields.length>0&&Object.keys(tool.configuration).length>0)
      const markup=renderToStaticMarkup(React.createElement(ToolDrawer,{companyId:company,tool,onClose(){},onSaved(){}}))
      assert(markup.includes('Configuration (JSON)'))
      assert(markup.includes('<summary>Advanced</summary>'))
      assert.equal(markup.includes('Action settings'),fields.length>0)
      for(const field of fields)assert(markup.includes('tool-config-'+field.key))
      const today=Date.parse(usage.usageToday()),start=today-29*86400000
      const points=tool.usage.points.filter(point=>Date.parse(point.date)>=start)
      const expected=usage.usageTotals(usage.usagePeriod(records,30).filter(record=>record.tool===tool.name))
      assert.equal(points.reduce((sum,point)=>sum+point.requests,0),expected.requests)
      assert.equal(points.reduce((sum,point)=>sum+point.errors,0),expected.errors)
      for(const days of [7,30]){
        const series=toolUsageSeries(tool.usage.points,days)
        assert.equal(series.points.length,days)
        assert.equal(series.points.at(-1).date,usage.usageToday())
        const expected=usage.usageTotals(usage.usagePeriod(records,days).filter(record=>record.tool===tool.name))
        assert.equal(series.points.reduce((sum,point)=>sum+point.requests,0),expected.requests)
        assert.equal(series.points.reduce((sum,point)=>sum+point.errors,0),expected.errors)
      }
      const chartMarkup=renderToStaticMarkup(React.createElement(ToolUsage,{usage:tool.usage}))
      assert(chartMarkup.includes('data-has-usage="true"'))
      assert(chartMarkup.includes('<polyline'))
      assert(!chartMarkup.includes('NaN'))
    }
  }
  assert.equal(config.parseToolConfiguration('{'),null)
  for(const raw of ['[]','null','42','"text"'])assert.equal(config.parseToolConfiguration(raw),null)
  const original=config.mockToolConfiguration('company-retail','http.request')
  const field=config.toolConfigurationFields('http.request').find(field=>field.key==='allowedMethods')
  const edited=config.setConfigurationField(original,field,'GET, POST')
  assert.deepEqual(clean(edited.allowedMethods),['GET','POST'])
  assert.deepEqual(clean(edited.retry),clean(original.retry))
  assert.deepEqual(clean(edited.headers),clean(original.headers))
  const parsed=config.parseToolConfiguration(JSON.stringify(edited))
  assert.equal(config.configurationDrafts('http.request',parsed).allowedMethods,'GET, POST')
  const numberField=config.toolConfigurationFields('web.search').find(field=>field.key==='maxResults')
  const badNumber=config.setConfigurationField(config.defaultToolConfiguration('web.search'),numberField,'')
  assert(config.validateToolConfiguration('web.search',badNumber).maxResults)
  assert(config.validateToolConfiguration('web.search',{maxResults:2.5}).maxResults)
  assert(config.validateToolConfiguration('http.request',{...original,baseUrl:'not-a-url'}).baseUrl)
  assert(config.validateToolConfiguration('http.request',{...original,allowedMethods:['INVALID']}).allowedMethods)
  assert(config.validateToolConfiguration('calendar.read',{timeZone:'not/a/timezone'}).timeZone)
  assert(config.validateToolConfiguration('email.send',{fromAddress:'not-email'}).fromAddress)
  assert(config.validateToolConfiguration('csv.export',{includeHeader:'yes'}).includeHeader)
  assert(config.validateToolConfiguration('csv.export',{delimiter:'invalid'}).delimiter)
  const custom={nested:{list:[1,2,3],enabled:false},baseUrl:'custom-provider-setting'}
  assert.equal(config.toolConfigurationFields('custom.run').length,0)
  assert.deepEqual(clean(config.validateToolConfiguration('custom.run',custom)),{})
  assert.deepEqual(clean(config.parseToolConfiguration(JSON.stringify(custom))),custom)
  const company='company-retail',http=(await tools.fetchTools(company)).find(tool=>tool.action==='http.request')
  const otherBefore=await tools.fetchTools('company-j1')
  const saved=await tools.saveTool(company,{...http,enabled:true,configuration:edited},http.id)
  assert.deepEqual(clean(saved.configuration),clean(edited))
  await assert.rejects(()=>tools.saveTool(company,{...http,enabled:true,configuration:{...edited,allowedMethods:['INVALID']}},http.id))
  const clone=await tools.fetchTool(company,http.id)
  clone.configuration.headers['X-Demo-Company']='mutated clone'
  assert.deepEqual(clean((await tools.fetchTool(company,http.id)).configuration),clean(edited))
  assert.deepEqual(clean(await tools.fetchTools('company-j1')),clean(otherBefore))
  const created=await tools.saveTool(company,{name:'Custom Demo',description:'Advanced JSON example',module:'Utility',action:'custom.run',risk:'low',timeoutSeconds:30,requiresConfirmation:false,enabled:false,configuration:custom})
  assert.deepEqual(clean((await tools.fetchTool(company,created.id)).configuration),custom)
  assert.notDeepEqual(clean(config.mockToolConfiguration('company-j1','knowledge.search')),clean(config.mockToolConfiguration('company-j2','knowledge.search')))
  const sparse=[
    {date:'2026-10-18',requests:10,errors:1,latencyMs:100},
    {date:'2026-10-18T12:00:00Z',requests:20,errors:2,latencyMs:200},
    {date:'2026-10-20',requests:5,errors:0,latencyMs:80},
    {date:'2026-09-01',requests:100,errors:0,latencyMs:50},
    {date:'invalid',requests:100,errors:0,latencyMs:50},
  ]
  const series=toolUsageSeries(sparse,7,'2026-10-20')
  assert.equal(series.hasData,true)
  assert.equal(series.points[0].date,'2026-10-14')
  assert.equal(series.points.at(-1).date,'2026-10-20')
  assert.equal(series.points.find(point=>point.date==='2026-10-19').requests,0)
  assert.equal(series.points.find(point=>point.date==='2026-10-19').errors,0)
  assert.equal(series.points.find(point=>point.date==='2026-10-19').latencyMs,0)
  assert.equal(series.points.find(point=>point.date==='2026-10-18').requests,30)
  assert.equal(series.points.reduce((sum,point)=>sum+point.requests,0),35)
  assert.equal(series.points.reduce((sum,point)=>sum+point.errors,0),3)
  assert(Math.abs(series.points.reduce((sum,point)=>sum+point.latencyMs*point.requests,0)/35-5400/35)<1e-6)
  const empty=toolUsageSeries([],30,'2026-10-20')
  assert.equal(empty.hasData,false)
  assert.equal(empty.points.length,30)
  assert(empty.points.every(point=>point.requests===0))
  assert.equal(toolUsageSeries(sparse,7,'2026-11-20').hasData,false)
  const emptyMarkup=renderToStaticMarkup(React.createElement(ToolUsage,{}))
  assert(emptyMarkup.includes('No executions recorded yet'))
  assert(!emptyMarkup.includes('<polyline'))
  console.log('Passed: action forms, JSON round trips, service validation, company isolation, calendar-day zero filling, weighted latency, chart/empty rendering and usage reconciliation.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
