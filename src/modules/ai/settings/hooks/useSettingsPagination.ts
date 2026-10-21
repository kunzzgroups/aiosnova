import { useEffect, useRef, useState } from 'react'
import { modelTableLayout } from '../services/modelTableLayout'

export function useSettingsPagination<T>(items: T[], loading: boolean, filterKey: string, options: { initialPageSize?: number; stretchRows?: boolean; fitCompletePages?: boolean } = {}) {
  const { initialPageSize = 0, stretchRows = true, fitCompletePages = false } = options
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [autoPageSize, setAutoPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const tableRef = useRef<HTMLDivElement>(null)
  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(items.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const explicitSizeKey=fitCompletePages?pageSize:undefined
  useEffect(() => { setPage(1) }, [filterKey, effectivePageSize, explicitSizeKey])
  useEffect(()=>{if(fitCompletePages&&tableRef.current)tableRef.current.scrollTop=0},[filterKey,currentPage,effectivePageSize,explicitSizeKey,fitCompletePages])
  useEffect(() => {
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (loading || !container || !table) return
    let frame = 0
    function measure() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      rows.forEach(row => row.style.removeProperty('height'))
      if (!rows.length) return
      const available = container.clientHeight - (table.querySelector('thead')?.getBoundingClientRect().height ?? 0)
      if (available <= 0) return
      const natural = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
      if(fitCompletePages){
        const layout=modelTableLayout(available,natural,pageSize,rows.length,currentPage===pageCount)
        if(!pageSize)setAutoPageSize(current=>current===layout.autoPageSize?current:layout.autoPageSize)
        if(stretchRows&&layout.rowHeight!==null)rows.forEach(row=>{row.style.height=layout.rowHeight+'px'})
        return
      }
      const limit = Math.max(1, Math.floor(available / natural))
      if (!pageSize) setAutoPageSize(current => current === limit ? current : limit)
      if (!stretchRows) return
      const height = !pageSize ? Math.max(natural, available / limit) : rows.length === pageSize ? Math.max(natural, available / rows.length) : natural
      rows.forEach(row => { row.style.height = height + 'px' })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(container); observer.observe(table); schedule()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); table.querySelectorAll('tbody tr').forEach(row => (row as HTMLElement).style.removeProperty('height')) }
  }, [loading, items.length, pageSize, effectivePageSize, currentPage, stretchRows, fitCompletePages, pageCount, filterKey])
  return { tableRef, rows: items.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize), pagination: { total: items.length, pageSize, autoPageSize, effectivePageSize, currentPage, pageCount, onPageSizeChange: setPageSize, onPageChange: setPage } }
}
