// Exercise the editor's actual handlers without a browser or DOM.
const assert = require('node:assert/strict')
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')
const {MemoryRouter} = require('react-router-dom')
const {load, clean, mock} = require('./check-settings-companies.cjs')
mock('src/modules/ai/settings/components/SettingsDrawer.tsx', {
  SettingsDrawer: ({open, children, footer}) => open ? React.createElement('section', null, children, footer) : null,
})
const {ToolDrawer} = load('src/modules/ai/settings/components/ToolDrawer.tsx')
const {ToolOverview} = load('src/modules/ai/settings/components/ToolOverview.tsx')
const tools = load('src/modules/ai/settings/services/toolsService.ts')

function editor(props) {
  const slots = []
  let tree, cursor = 0
  function render() {
    const useState = React.useState, useRef = React.useRef
    React.useState = initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    }
    React.useRef = initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = {current: initial}
      return slots[index]
    }
    try { cursor = 0; const element = ToolDrawer(props); tree = element.type(element.props) }
    finally { React.useState = useState; React.useRef = useRef }
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined
    if (Array.isArray(node)) return node.map(item => find(predicate, item)).find(Boolean)
    if (predicate(node)) return node
    return node.props?.children == null ? undefined : find(predicate, node.props.children)
  }
  function field(id) { const node = find(node => node.props?.id === id); assert(node, id); return node.props }
  function change(id, value) {
    const props = field(id)
    props.onChange(typeof props.onOpenChange === 'function' ? value : {target: {value}})
    render()
  }
  render()
  return {field, change, render, find, async save() { field('ai-tool-form').onSubmit({preventDefault(){}}); await new Promise(resolve => setImmediate(resolve)); render() }}
}

async function main() {
  {
  const historyCompany = 'tool-action-history-regression'
  const original = (await tools.fetchTools(historyCompany))[0]
  const unchanged = await tools.saveTool(historyCompany, {...original, name: 'Renamed instance', enabled: true}, original.id)
  assert.deepEqual(clean(unchanged.usage), clean(original.usage))
  const changed = await tools.saveTool(historyCompany, {...unchanged, action: 'regression.run', module: 'Utility', risk: 'low', configuration: {}, enabled: true}, original.id)
  assert.equal(changed.usage, undefined)
  assert.deepEqual(clean(changed.agents), clean(original.agents))
  assert.equal(changed.previousActions.length, 1)
  assert.equal(changed.previousActions[0].action, original.action)
  assert.deepEqual(clean(changed.previousActions[0].usage), clean(original.usage))
  assert.deepEqual(clean(changed.previousActions[0].configuration), clean(original.configuration))
  assert.match(changed.activity[0].message, /action changed from/)
  changed.previousActions[0].configuration.externalMutation = true
  assert.equal((await tools.fetchTool(historyCompany, original.id)).previousActions[0].configuration.externalMutation, undefined)
  }
  const company = 'company-retail'
  const tool = (await tools.fetchTools(company)).find(item => item.action === 'http.request')
  const otherBefore = clean(await tools.fetchTools('company-j1'))
  let saved
  const form = editor({companyId: company, tool, onClose(){}, onSaved(value){saved = value}})
  form.change('tool-config-baseUrl', 'https://edited.example.test')
  form.change('tool-risk', 'high')
  form.change('tool-timeout', '125')
  const original = JSON.parse(form.field('tool-configuration').value)
  original.retry.maxAttempts = 7
  original.extra = {preserve: true}
  form.change('tool-configuration', JSON.stringify(original))
  assert.equal(form.field('tool-config-baseUrl').value, original.baseUrl)
  form.change('tool-type', 'calendar.read')
  form.change('tool-config-daysAhead', '22')
  form.change('tool-type', 'http.request')
  assert.equal(form.field('tool-timeout').value, '125')
  assert.equal(form.field('tool-risk').value, 'high')
  assert.deepEqual(JSON.parse(form.field('tool-configuration').value), original)
  form.change('tool-type', 'calendar.read')
  assert.equal(form.field('tool-config-daysAhead').value, '22')
  form.change('tool-type', 'http.request')
  form.change('tool-configuration', '{invalid')
  assert.equal(form.field('tool-config-baseUrl').disabled, true)
  await form.save()
  assert.equal(saved, undefined)
  form.change('tool-type', 'calc.run')
  form.change('tool-type', 'http.request')
  assert.equal(form.field('tool-configuration').value, '{invalid')
  form.change('tool-configuration', JSON.stringify(original))
  form.change('tool-config-maxResponseKB', '512')
  assert.equal(JSON.parse(form.field('tool-configuration').value).maxResponseKB, 512)
  await form.save()
  assert(saved)
  assert.equal(saved.requiresConfirmation, true)
  assert.equal(saved.timeoutSeconds, 125)
  assert.equal(saved.configuration.retry.maxAttempts, 7)
  assert.deepEqual(clean(saved.configuration.extra), {preserve: true})
  assert.deepEqual(clean((await tools.fetchTool(company, tool.id)).configuration), clean(saved.configuration))
  const details = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ToolOverview, {tool:saved, onEdit(){}, onAction(){}, onSaved(){}})))
  assert(details.includes('https://edited.example.test'))
  assert(details.includes('512'))
  assert(details.includes('125 seconds'))
  assert.deepEqual(clean(await tools.fetchTools('company-j1')), otherBefore)
  await assert.rejects(() => tools.saveTool('company-j1', {...saved, action:'unique.crosscompany', enabled:true}, saved.id), /not found in this company/)
  assert.deepEqual(clean(await tools.fetchTools('company-j1')), otherBefore)

  let customSaved
  const custom = editor({companyId:company, tool:null, onClose(){}, onSaved(value){customSaved = value}})
  custom.change('tool-type', 'custom')
  custom.change('tool-name', 'Custom editor regression')
  custom.change('tool-action', 'custom.initial')
  custom.change('tool-configuration', '{"nested":{"enabled":true}}')
  custom.change('tool-action', 'custom.updated')
  assert.deepEqual(JSON.parse(custom.field('tool-configuration').value), {nested:{enabled:true}})
  custom.change('tool-type', 'csv.export')
  custom.change('tool-type', 'custom')
  assert.equal(custom.field('tool-action').value, 'custom.updated')
  assert.deepEqual(JSON.parse(custom.field('tool-configuration').value), {nested:{enabled:true}})
  await custom.save()
  assert(customSaved)
  assert.equal(customSaved.action, 'custom.updated')
  assert.deepEqual(clean(customSaved.configuration), {nested:{enabled:true}})
  assert.notEqual(ToolDrawer({companyId:company,tool:null}).key, ToolDrawer({companyId:'company-j1',tool:null}).key)
  const fresh = editor({companyId:'company-j1', tool:null, onClose(){}, onSaved(){}})
  assert.equal(fresh.field('tool-type').value, '')
  assert.equal(fresh.field('tool-name').value, '')
  assert.equal(fresh.field('tool-configuration').value, '{}')
  // Create two instances through the Add form, even when this action already exists.
  const originalBefore = clean(await tools.fetchTool(company, tool.id))
  const instances = []
  for (const [name, url] of [['Orders API','https://orders.example.test'],['Inventory API','https://inventory.example.test']]) {
    const add = editor({companyId:company,tool:null,onClose(){},onSaved(value){instances.push(value)}})
    add.change('tool-type','http.request')
    add.change('tool-name',name)
    add.change('tool-config-baseUrl',url)
    await add.save()
  }
  assert.equal(instances.length,2)
  const [orders,inventory] = instances
  assert.notEqual(orders.id,inventory.id)
  assert.equal(orders.action,inventory.action)
  assert.equal(orders.usage,undefined)
  assert.equal(inventory.usage,undefined)
  assert.equal(orders.activity.length,1)
  assert.equal(inventory.activity.length,1)
  const inventoryBefore = clean(await tools.fetchTool(company,inventory.id))
  const edit = editor({companyId:company,tool:orders,onClose(){},onSaved(){}})
  edit.change('tool-config-baseUrl','https://orders-v2.example.test')
  await edit.save()
  await tools.saveToolAgents(company,orders.id,[])
  const edited = await tools.fetchTool(company,orders.id)
  assert.equal(edited.configuration.baseUrl,'https://orders-v2.example.test')
  assert.deepEqual(clean(edited.agents),[])
  assert.deepEqual(clean(await tools.fetchTool(company,inventory.id)),inventoryBefore)
  assert.deepEqual(clean(await tools.fetchTool(company,tool.id)),originalBefore)
  const usage=load('src/modules/ai/settings/services/usageService.ts')
  const history=await usage.fetchUsageRecords(company)
  const catalog=await tools.fetchTools(company)
  const breakdown=usage.usageBreakdown(history,'tool',catalog)
  assert.equal(breakdown.length,catalog.length)
  assert.equal(breakdown.find(row=>row.id===orders.id).name,orders.name)
  assert.equal(breakdown.find(row=>row.id===orders.id).requests,0)
  assert.equal(breakdown.find(row=>row.id===inventory.id).requests,0)
  const groupedTotals=usage.usageTotals(breakdown),historyTotals=usage.usageTotals(history)
  for(const key of Object.keys(historyTotals))assert(Math.abs(groupedTotals[key]-historyTotals[key])<1e-6,key)
  const originalRequests=history.filter(record=>record.toolId===tool.id).reduce((sum,row)=>sum+row.requests,0)
  assert.equal(breakdown.find(row=>row.id===tool.id).requests,originalRequests)
  const renamed=usage.usageBreakdown(history,'tool',catalog.map(item=>({...item,name:item.id===tool.id?'Renamed original':item.name})))
  assert.equal(renamed.find(row=>row.id===tool.id).name,'Renamed original')
  assert.equal(renamed.find(row=>row.id===tool.id).requests,originalRequests)
  const sample=history[0]
  const sameName=usage.usageBreakdown([{...sample,tool:'Same name',toolId:orders.id,requests:3},{...sample,tool:'Same name',toolId:inventory.id,requests:7}],'tool',[{id:orders.id,name:'Same name'},{id:inventory.id,name:'Same name'}])
  assert.equal(sameName.length,2)
  assert.equal(sameName.find(row=>row.id===orders.id).requests,3)
  assert.equal(sameName.find(row=>row.id===inventory.id).requests,7)
  assert(!usage.usageBreakdown(await usage.fetchUsageRecords('company-j1'),'tool',await tools.fetchTools('company-j1')).some(row=>row.id===orders.id))
  await tools.deleteTool(company,inventory.id)
  await assert.rejects(()=>tools.fetchTool(company,inventory.id),/not found/)
  assert.deepEqual(clean(await tools.fetchTool(company,orders.id)),clean(edited))
  assert.deepEqual(clean(await tools.fetchTools('company-j1')),otherBefore)
  const agent = load('src/modules/ai/mock/seed.ts').SEED_AGENTS.find(agent=>agent.companyId==='company-j1')
  assert(agent)
  const j1First = await tools.saveTool('company-j1',{...orders,name:'Assigned duplicate',enabled:false})
  const j1Second = await tools.saveTool('company-j1',{...inventory,name:'Unassigned duplicate',enabled:false})
  await tools.saveToolAgents('company-j1',j1First.id,[agent.name])
  assert.deepEqual(clean((await tools.fetchTool('company-j1',j1First.id)).agents),[agent.name])
  assert.deepEqual(clean((await tools.fetchTool('company-j1',j1Second.id)).agents),[])
  await assert.rejects(()=>tools.deleteTool('company-j1',j1First.id),/assigned agents/)
  await tools.saveToolAgents('company-j1',j1First.id,[])
  await tools.deleteTool('company-j1',j1First.id)
  await tools.deleteTool('company-j1',j1Second.id)
  assert.deepEqual(clean(await tools.fetchTools('company-j1')),otherBefore)
  console.log('Passed: actual editor handlers, type draft restoration, invalid JSON recovery, two-way synchronization, save/detail round trip, custom action rename and company isolation.')
}
main().catch(error => {console.error(error); process.exitCode = 1})
