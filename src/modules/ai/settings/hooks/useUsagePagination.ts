import { useEffect, useRef, useState } from 'react'
import { usageTableLayout } from '../services/usageTableLayout'

// Usage has a compact density range, independent of directory row stretching.
export function useUsagePagination<T>(items: T[], loading: boolean, filterKey: string) {
  const tableRef=useRef<HTMLDivElement>(null)
  const [pageSize,setPageSize]=useState(0),[autoPageSize,setAutoPageSize]=useState(1),[page,setPage]=useState(1)
  const effectivePageSize=pageSize||autoPageSize,pageCount=Math.max(1,Math.ceil(items.length/effectivePageSize)),currentPage=Math.min(page,pageCount)
  useEffect(()=>{setPage(1)},[filterKey,pageSize,effectivePageSize])
  useEffect(()=>{if(tableRef.current)tableRef.current.scrollTop=0},[filterKey,pageSize,effectivePageSize,currentPage])
  useEffect(()=>{
    const container=tableRef.current,table=container?.querySelector('table')
    if(loading||!container||!table||!items.length)return
    let frame=0
    const measure=()=>{
      const rows=Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      rows.forEach(row=>row.style.removeProperty('height'))
      if(pageSize||!rows.length)return
      const rootSize=parseFloat(getComputedStyle(document.documentElement).fontSize)||16
      let minimum=2*rootSize
      // Preserve actual multi-line content, including duplicate tool identifiers.
      rows.forEach(row=>Array.from(row.cells).forEach(cell=>{
        const style=getComputedStyle(cell)
        // Inline siblings occupy the same line; adding their heights undercounts
        // capacity. Measure their combined vertical extent instead.
        const bounds=Array.from(cell.children).map(child=>child.getBoundingClientRect()).filter(rect=>rect.height>0)
        const content=bounds.length?Math.max(...bounds.map(rect=>rect.bottom))-Math.min(...bounds.map(rect=>rect.top)):(parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5)
        minimum=Math.max(minimum,content+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+1)
      }))
      const available=container.clientHeight-(table.querySelector('thead')?.getBoundingClientRect().height??0)
      if(available<=0)return
      const capacity=usageTableLayout(available,2.375*rootSize,minimum).capacity
      const lastPage=currentPage>=Math.max(1,Math.ceil(items.length/capacity))
      const complete=rows.length===capacity
      // Match the CSS container breakpoint, including expanded/collapsed sidebar.
      const fitRemainder=getComputedStyle(container).getPropertyValue('--usage-fit-remainder').trim()==='1'
      const layout=usageTableLayout(available,2.375*rootSize,minimum,!fitRemainder||(lastPage&&!complete))
      setAutoPageSize(previous=>previous===layout.capacity?previous:layout.capacity)
      if(!fitRemainder||!lastPage||complete)rows.forEach(row=>{row.style.height=layout.rowHeight+'px'})
    }
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    const observer=new ResizeObserver(schedule)
    observer.observe(container);observer.observe(table);schedule()
    return()=>{observer.disconnect();cancelAnimationFrame(frame);table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row=>row.style.removeProperty('height'))}
  },[loading,items.length,pageSize,currentPage,effectivePageSize,filterKey])
  return {tableRef,rows:items.slice((currentPage-1)*effectivePageSize,currentPage*effectivePageSize),pagination:{total:items.length,pageSize,autoPageSize,effectivePageSize,currentPage,pageCount,onPageSizeChange:setPageSize,onPageChange:setPage}}
}
