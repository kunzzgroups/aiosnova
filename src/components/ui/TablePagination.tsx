import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import './TablePagination.css'

type TablePaginationProps = {
  id: string
  total: number
  pageSize: number
  autoPageSize: number
  effectivePageSize: number
  currentPage: number
  pageCount: number
  pagesLabel: string
  translationPrefix?: string
  onPageSizeChange: (size: number) => void
  onPageChange: (page: number) => void
}

function paginationItems(current: number, total: number): (number | 'backward' | 'forward')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const start = Math.max(2, Math.min(current - 2, total - 5))
  const end = Math.min(total - 1, Math.max(current + 2, 6))
  const items: (number | 'backward' | 'forward')[] = [1]
  if (start > 2) items.push('backward')
  for (let number = start; number <= end; number++) items.push(number)
  if (end < total - 1) items.push('forward')
  items.push(total)
  return items
}

export function TablePagination({ id, total, pageSize, autoPageSize, effectivePageSize, currentPage, pageCount, pagesLabel, translationPrefix = 'users', onPageSizeChange, onPageChange }: TablePaginationProps) {
  const { t } = useTranslation()
  const translate = (key: string, values?: Record<string, number>) => t(`${translationPrefix}.${key}`, values)
  return (
        <footer className="identity-directory-footer">
          <div className="identity-directory-footer__listing">
            <label htmlFor={id}>{translate('rowsPerPage')}</label>
            <SidebarSelect id={id} hideLabel className="identity-pagination-select" label={translate('rowsPerPage')} title={pageSize===0? translate('autoRowsHint', { count: autoPageSize }):undefined} value={String(pageSize)} options={[{ value: '0', label: '–' }, ...[10,25,50,100,200].map(n => ({ value: String(n), label: String(n) }))]} onChange={value => onPageSizeChange(Number(value))} />
            <span>{translate('listingRange', { start: total ? (currentPage-1)*effectivePageSize+1 : 0, end: Math.min(currentPage*effectivePageSize,total), total: total })}</span>
          </div>
          <nav className="identity-pagination" aria-label={pagesLabel}>
            <Button variant="secondary" disabled={currentPage===1} onClick={() => onPageChange(currentPage-1)} aria-label={translate('previousPage')}>‹</Button>
            {paginationItems(currentPage,pageCount).map(item => {
              if (typeof item === 'number') return (
                <Button key={item} variant="secondary" aria-label={translate('pageNumber', { page: item })} aria-current={item===currentPage? 'page':undefined} onClick={() => onPageChange(item)}>{item}</Button>
              )
              const backward = item === 'backward'
              const label = translate(backward ? 'jumpBackPages' : 'jumpForwardPages')
              return <Button key={item} variant="ghost" className="identity-pagination__jump" aria-label={label} title={label} onClick={() => onPageChange(Math.max(1,Math.min(pageCount,currentPage + (backward ? -5 : 5))))}>
                <span className="identity-pagination__ellipsis" aria-hidden>•••</span>
                <span className="identity-pagination__jump-arrow" aria-hidden>{backward ? '«' : '»'}</span>
              </Button>
            })}
            <Button variant="secondary" disabled={currentPage===pageCount} onClick={() => onPageChange(currentPage+1)} aria-label={translate('nextPage')}>›</Button>
          </nav>
        </footer>
  )
}
