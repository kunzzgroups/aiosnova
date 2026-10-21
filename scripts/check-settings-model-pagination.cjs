const assert = require('node:assert/strict')
const {load} = require('./check-settings-companies.cjs')
const {modelTableLayout} = load('src/modules/ai/settings/services/modelTableLayout.ts')
const {modelPaginationItems} = load('src/modules/ai/settings/components/ModelsPagination.tsx')

// Heights represent the viewport after subtracting the header, footer and
// horizontal scrollbar. Include fractional row heights and very short panels.
for (const available of [80, 280, 431, 620, 780]) {
  for (const natural of [59.25, 60, 65.5]) {
    for (const selected of [0, 10, 25]) {
      const measured = modelTableLayout(available, natural, selected, 10, false)
      const size = selected || measured.autoPageSize
      const ids = Array.from({length:306}, (_, index) => index + 1)
      const count = Math.ceil(ids.length / size)
      const seen = []
      for (let page=1; page<=count; page++) {
        const rows = ids.slice((page-1)*size, page*size)
        const layout = modelTableLayout(available, natural, selected, rows.length, page===count)
        seen.push(...rows)
        assert(rows.length<=size)
        if (!selected) {
          if (natural<=available-1) assert(rows.length*natural<=available-1)
          assert((size+1)*natural>available-1)
        }
        if (page===count) assert.equal(layout.rowHeight,null)
        if (rows.length*natural>available-1) assert.equal(layout.rowHeight,null)
        if (page<count && rows.length*natural<available-1) {
          assert(Math.abs(layout.rowHeight*rows.length-(available-1))<1e-6)
        }
        const buttons = modelPaginationItems(page,count)
        assert(buttons.includes(page))
        assert.equal(buttons[0],1)
        assert.equal(buttons.at(-1),count)
        assert(buttons.length<=7)
      }
      assert.deepEqual(seen,ids)
    }
  }
}
// A full final page also stays natural, including a single-page result.
assert.equal(modelTableLayout(780,60,10,10,true).rowHeight,null)
assert.equal(modelTableLayout(780,60,25,6,true).rowHeight,null)
// Full -> half -> full and Auto -> 10 -> 25 -> Auto do not carry fitted heights.
assert.equal(modelTableLayout(620,60,0,10,false).autoPageSize,10)
assert.equal(modelTableLayout(431,60,0,10,false).autoPageSize,7)
assert.equal(modelTableLayout(620,60,0,7,false).autoPageSize,10)
assert.equal(modelTableLayout(620,60,10,10,false).rowHeight,61.9)
assert.equal(modelTableLayout(431,60,10,10,false).rowHeight,null)
assert.equal(modelTableLayout(620,60,25,25,false).rowHeight,null)
assert.equal(modelTableLayout(620,60,0,25,false).rowHeight,null)
// Auto pages fill exactly to the footer without changing the capacity.
for(const [available,rows] of [[566,9],[622,10]]) {
  const layout=modelTableLayout(available,59.25,0,rows,false)
  assert.equal(layout.autoPageSize,rows)
  assert(Math.abs(layout.rowHeight*rows-(available-1))<1e-6)
  assert.equal(modelTableLayout(available,59.25,0,rows,true).rowHeight,null)
}
console.log('Passed: Models Auto/10/25 sizing, full/half heights, fractional rows, page coverage, compact controls and unstretched last pages.')
// Tools opts into exactly the same sizing policy, with shorter fixture lists.
for(const total of [0,4,8,12])for(const available of [280,620])for(const selected of [0,10,25]){
  const auto=modelTableLayout(available,72,selected,0,false).autoPageSize
  const size=selected||auto,count=Math.max(1,Math.ceil(total/size))
  for(let page=1;page<=count;page++){
    const rows=Math.max(0,Math.min(size,total-(page-1)*size))
    const layout=modelTableLayout(available,72,selected,rows,page===count)
    if(page===count)assert.equal(layout.rowHeight,null)
    if(layout.rowHeight!==null)assert(Math.abs(layout.rowHeight*rows-(available-1))<1e-6)
  }
}
console.log('Passed: Tools empty/short/multiple pages, Auto/10/25 and natural final-page rows.')
