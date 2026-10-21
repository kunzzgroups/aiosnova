import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { TablePagination } from '@/components/ui/TablePagination'
import './SettingsPagination.css'

export function modelPaginationItems(current: number, total: number): (number | 'backward' | 'forward')[] {
  if (total <= 5) return Array.from({length:total}, (_, index) => index + 1)
  const start = Math.max(2, Math.min(current - 1, total - 3))
  const end = Math.min(total - 1, Math.max(current + 1, 3))
  const items: (number | 'backward' | 'forward')[] = [1]
  if (start > 2) items.push('backward')
  for (let page = start; page <= end; page++) items.push(page)
  if (end < total - 1) items.push('forward')
  items.push(total)
  return items
}

export function ModelsPagination(props: ComponentProps<typeof TablePagination>) {
  const {t} = useTranslation()
  const {currentPage, pageCount, onPageChange} = props
  return <div className="ai-model-pagination">
    <TablePagination {...props}/>
    <nav className="identity-pagination ai-model-pagination__compact" aria-label={props.pagesLabel}>
      <Button variant="secondary" disabled={currentPage===1} onClick={()=>onPageChange(currentPage-1)} aria-label={t('users.previousPage')}>‹</Button>
      {modelPaginationItems(currentPage,pageCount).map(item=>typeof item==='number'
        ? <Button key={item} variant="secondary" aria-label={t('users.pageNumber',{page:item})} aria-current={item===currentPage?'page':undefined} onClick={()=>onPageChange(item)}>{item}</Button>
        : <Button key={item} variant="ghost" aria-label={t(item==='backward'?'users.jumpBackPages':'users.jumpForwardPages')} onClick={()=>onPageChange(Math.max(1,Math.min(pageCount,currentPage+(item==='backward'?-5:5))))}>…</Button>)}
      <Button variant="secondary" disabled={currentPage===pageCount} onClick={()=>onPageChange(currentPage+1)} aria-label={t('users.nextPage')}>›</Button>
    </nav>
  </div>
}
