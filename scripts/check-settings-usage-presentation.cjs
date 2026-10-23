const assert=require('node:assert/strict')
const {load}=require('./check-settings-companies.cjs')
const {usageWindow,usageComparison,usageExportCsv}=load('src/modules/ai/settings/services/usagePresentation.ts')
const usage=load('src/modules/ai/settings/services/usageService.ts')
const {usageTableLayout}=load('src/modules/ai/settings/services/usageTableLayout.ts')
// Three compact rows absorb the small remainder above the pinned footer.
const fitted=usageTableLayout(120,38,32)
assert.equal(fitted.capacity,3)
assert.equal(fitted.rowHeight*3,119)
assert.equal(usageTableLayout(120,38,32,true).rowHeight,38)
for(const available of [40,120,180,300,500]){
  const layout=usageTableLayout(available,38,32)
  assert(layout.rowHeight<=46)
  assert(layout.rowHeight*layout.capacity<=available-1)
}
for(const days of [7,30,60]){
  const range=usageWindow(days,'2026-10-21')
  assert.equal((Date.parse(range.end)-Date.parse(range.start))/86400000+1,days)
  const records=usage.usagePeriod(usage.generateUsageRecords('company-j1'),days,false,range.end)
  for(const group of ['model','agent','user','tool','mcp']){
    const rows=usage.usageBreakdown(records,group).slice(0,2)
    const csv=usageExportCsv(rows,group,'company-j1',range)
    assert.equal(csv.split('\r\n').length,rows.length+1)
    assert(csv.includes(range.start)&&csv.includes(range.end))
    assert(csv.includes('Mock estimate')&&csv.includes('Estimated cost (MYR)'))
    assert.equal(csv.includes('Tool ID'),group==='tool')
    rows.forEach(row=>assert(csv.includes(row.cost.toFixed(2))))
  }
}
assert.equal(usageComparison(0,0,30),'No usage in either period')
assert.equal(usageComparison(100,0,30),'No previous usage to compare')
assert.equal(usageComparison(120,100,7),'+20.0% vs previous 7 days')
assert.equal(usageComparison(80,100,60),'-20.0% vs previous 60 days')
const csv=usageExportCsv([{id:'one',name:'=HYPERLINK("x")',requests:0,input:0,output:0,cost:0,errors:0}], 'tool','company-j2',usageWindow(7,'2026-10-21'))
assert(csv.includes("'=HYPERLINK"))
assert(!csv.includes('NaN')&&!csv.includes('Infinity'))
console.log('Passed: inclusive 7/30/60 day windows, filtered exports, all breakdown groups, MYR estimates, zero-baseline comparison and spreadsheet-safe names.')
