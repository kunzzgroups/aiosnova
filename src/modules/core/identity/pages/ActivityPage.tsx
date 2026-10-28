import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCircleCheck, IconPencil, IconPlus, IconSearch, IconShield, IconTrash, IconX } from '@/components/icons/Icons'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { Button } from '@/components/ui/Button'
import { DateRangeField } from '@/components/ui/DateRangeField'
import { zonedDate } from '@/components/ui/dateRange'
import { FormField } from '@/components/ui/FormField'
import { TablePagination } from '@/components/ui/TablePagination'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { activityEvents, type ActivityEvent } from '../mock/activity'
import './IdentityPage.css'
import './ActivityPage.css'

type Filters = { query: string; actor: string; module: string; action: string; result: string; from: string; to: string }
const initialFilters: Filters = { query: '', actor: 'all', module: 'all', action: 'all', result: 'all', from: '2026-10-01', to: '2026-10-17' }

const actionIcon = { created: IconPlus, updated: IconPencil, deleted: IconTrash, login: IconShield } as const

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(new Date(value))
}

export function ActivityPage() {
  const { t, i18n } = useTranslation()
  const [filterError, setFilterError] = useState('')
  const [draft, setDraft] = useState<Filters>(initialFilters)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selectedId, setSelectedId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(0)
  const [autoPageSize, setAutoPageSize] = useState(10)
  const tableRef = useRef<HTMLDivElement>(null)
  const autoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const visibleEvents = useMemo(() => activityEvents.filter(event => {
    const query = filters.query.trim().toLocaleLowerCase()
    const matchesQuery = !query || `${event.actor} ${event.email} ${event.target} ${t(event.actionKey)} ${t(event.moduleKey)}`.toLocaleLowerCase().includes(query)
    const date = zonedDate(new Date(event.occurredAt), 'Asia/Singapore')
    return matchesQuery && (filters.actor === 'all' || event.actor === filters.actor) && (filters.module === 'all' || event.module === filters.module) && (filters.action === 'all' || event.action === filters.action) && (filters.result === 'all' || event.result === filters.result) && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
  }), [filters, t])
  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(visibleEvents.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedEvents = visibleEvents.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
  const selectedRow = visibleEvents.find(event => event.id === selectedId) ?? null

  useEffect(() => { setPage(1) }, [effectivePageSize])
  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0 }, [currentPage, effectivePageSize])
  useEffect(() => {
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table || pageSize !== 0 || !visibleEvents.length) return
    let frame = 0
    function measure() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      // Measure natural rows before distributing space, so fitted heights do not
      // feed back into the capacity calculation on the next resize.
      table.style.removeProperty('height')
      const header = table.querySelector('thead')
      header?.style.removeProperty('height')
      rows.forEach(row => row.style.removeProperty('height'))
      const width = container.clientWidth
      if (autoFitRowMeasurement.current.width !== width) {
        autoFitRowMeasurement.current = { width, height: 0 }
      }
      // Retain the natural full-page measurement on partial pages, just as the
      // employee and position tables do, so pagination keeps a stable density.
      if (currentPage === 1 || !autoFitRowMeasurement.current.height) {
        const naturalHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
        autoFitRowMeasurement.current.height = Math.max(autoFitRowMeasurement.current.height, naturalHeight)
      }
      const rowHeight = autoFitRowMeasurement.current.height
      const headerHeight = header?.getBoundingClientRect().height ?? 0
      const availableHeight = container.clientHeight - headerHeight
      if (availableHeight <= 0 || !rows.length) return
      const capacity = Math.max(1, Math.floor(availableHeight / rowHeight))
      setAutoPageSize(current => current === capacity ? current : capacity)
      if (rows.length <= capacity) {
        const fittedHeight = availableHeight / capacity
        if (header) header.style.height = `${headerHeight}px`
        rows.forEach(row => { row.style.height = `${fittedHeight}px` })
        // Full pages fill the viewport; partial pages keep the same row height.
        table.style.height = `${headerHeight + fittedHeight * rows.length}px`
      }
    }
    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(table)
    scheduleMeasure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      table.style.removeProperty('height')
      table.querySelector('thead')?.style.removeProperty('height')
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [pageSize, currentPage, effectivePageSize, visibleEvents.length, i18n.language])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.from && draft.to && draft.from > draft.to) { setFilterError(t('activity.invalidDateRange')); return }
    setFilterError('')
    setFilters(draft)
    setPage(1)
    setSelectedId('')
  }

  function resetFilters() {
    setFilterError('')
    setDraft({ ...initialFilters, from: '', to: '' })
    setFilters({ ...initialFilters, from: '', to: '' })
    setPage(1)
    setSelectedId('')
  }

  const setField = (field: keyof Filters, value: string) => setDraft(current => ({ ...current, [field]: value }))
  const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-GB'

  return (
    <section className="activity-page">
      <form className="activity-filter-panel" onSubmit={submitFilters}>
        <TableToolbar
          search={<><IconSearch aria-hidden="true" /><TextField id="activity-query" type="search" value={draft.query} onChange={event => setField('query', event.target.value)} placeholder={t('activity.searchPlaceholder')} aria-label={t('activity.search')} /></>}
          filters={<div className="activity-toolbar-filters">
            <FormField label={t('activity.dateRange')} htmlFor="activity-range" className="activity-date-range"><DateRangeField id="activity-range" label={t('activity.dateRange')} timeZone="Asia/Singapore" value={{ from: draft.from, to: draft.to }} onChange={range => setDraft(current => ({ ...current, ...range }))} /></FormField>
            <div className="activity-filter-selects">
              <FilterSelect id="activity-actor" label={t('activity.actor')} value={draft.actor} onChange={value => setField('actor', value)} options={['all', ...new Set(activityEvents.map(item => item.actor))]} allLabel={t('activity.allActors')} />
              <FilterSelect id="activity-module" label={t('activity.module')} value={draft.module} onChange={value => setField('module', value)} options={['all', ...new Set(activityEvents.map(item => item.module))]} optionLabel={value => value === 'all' ? t('activity.allModules') : t(`activity.module.${value}`)} />
              <FilterSelect id="activity-action" label={t('activity.action')} value={draft.action} onChange={value => setField('action', value)} options={['all', ...new Set(activityEvents.map(item => item.action))]} optionLabel={value => value === 'all' ? t('activity.allActions') : t(`activity.action.${value}`)} />
              <FilterSelect id="activity-result" label={t('activity.result')} value={draft.result} onChange={value => setField('result', value)} options={['all', 'success', 'failure']} optionLabel={value => value === 'all' ? t('activity.allResults') : t(`activity.result.${value}`)} />
            </div>
          </div>}
          actions={<><Button variant="secondary" onClick={resetFilters}><IconX aria-hidden="true" />{t('activity.reset')}</Button><Button type="submit"><IconSearch aria-hidden="true" />{t('activity.searchAction')}</Button></>}
        />
        {filterError && <p className="activity-filter-error" role="alert">{filterError}</p>}
      </form>

      <div className={`activity-content${selectedRow ? ' activity-content--details-open' : ''}`}>
        <TablePanel className="activity-log">
          <header className="activity-log__header">
            <div><h2>{t('activity.logTitle')}</h2><span className="activity-count">{t('activity.recordCount', { count: visibleEvents.length })}</span></div>
            <span className="activity-log__scope">{t('activity.scopeLabel')}</span>
          </header>
          <div className="activity-table-scroll identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label={t('activity.logTitle')}>
            <table className="activity-table">
              <thead><tr><th>{t('activity.dateTime')}</th><th>{t('activity.actor')}</th><th>{t('activity.module')}</th><th>{t('activity.action')}</th><th>{t('activity.target')}</th><th>{t('activity.result')}</th></tr></thead>
              <tbody>
                {pagedEvents.map(event => <ActivityRow key={event.id} event={event} selected={selectedRow?.id === event.id} locale={locale} onSelect={() => setSelectedId(event.id)} />)}
                {visibleEvents.length === 0 && <tr><td colSpan={6} className="activity-empty">{t('activity.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination id="activity-page-size" total={visibleEvents.length} pageSize={pageSize} autoPageSize={autoPageSize} effectivePageSize={effectivePageSize} currentPage={currentPage} pageCount={pageCount} pagesLabel={t('activity.pagesLabel')} translationPrefix="activity" onPageSizeChange={size => { setPageSize(size); setPage(1) }} onPageChange={setPage} />
        </TablePanel>

        {selectedRow && <ActivityDetails event={selectedRow} locale={locale} onClose={() => setSelectedId('')} />}
      </div>
    </section>
  )
}

function FilterSelect({ id, label, value, onChange, options, allLabel, optionLabel }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[]; allLabel?: string; optionLabel?: (value: string) => string }) {
  return <SidebarSelect id={id} label={label} className="activity-filter-field" value={value} onChange={onChange} options={options.map(option => ({ value: option, label: optionLabel ? optionLabel(option) : option === 'all' ? allLabel ?? option : option }))} />
}

function ActivityRow({ event, selected, locale, onSelect }: { event: ActivityEvent; selected: boolean; locale: string; onSelect: () => void }) {
  const { t } = useTranslation()
  const ActionIcon = actionIcon[event.action]
  return <tr className={selected ? 'is-selected' : undefined} aria-selected={selected} tabIndex={0} onClick={onSelect} onKeyDown={keyEvent => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); onSelect() } }}>
    <td className="activity-time"><span>{formatDateTime(event.occurredAt, locale)}</span></td>
    <td><span className="activity-actor"><span className="activity-avatar">{event.initials}</span><span>{event.actor}</span></span></td>
    <td className="activity-module">{t(event.moduleKey)}</td>
    <td><span className={`activity-action-icon activity-action-icon--${event.action}`}><ActionIcon aria-hidden="true" /></span><span className="activity-action-label">{t(event.actionKey)}</span></td>
    <td className="activity-target" title={event.target}>{event.target}</td>
    <td><span className={`activity-result activity-result--${event.result}`}>{event.result === 'success' ? <IconCircleCheck aria-hidden="true" /> : <IconX aria-hidden="true" />}{t(`activity.result.${event.result}`)}</span></td>
  </tr>
}

function ActivityDetails({ event, locale, onClose }: { event: ActivityEvent; locale: string; onClose: () => void }) {
  const { t } = useTranslation()
  const ActionIcon = actionIcon[event.action]
  return <aside className="activity-details" aria-label={t('activity.detailsTitle')}>
    <header className="activity-details__header"><div className="activity-details__event-icon"><ActionIcon aria-hidden="true" /><span className={`activity-details__result-dot activity-details__result-dot--${event.result}`} /></div><div><h2>{t(event.actionKey)}</h2><p>{formatDateTime(event.occurredAt, locale)}</p></div><Button variant="ghost" size="icon" className="activity-details__close" onClick={onClose} aria-label={t('activity.closeDetails')}><IconX aria-hidden="true" /></Button></header>
    <div className="activity-details__scroll" tabIndex={0} role="region" aria-label={t('activity.detailsTitle')}>
    <section className="activity-detail-card"><h3>{t('activity.actorInformation')}</h3><div className="activity-detail-actor"><span className="activity-avatar activity-avatar--large">{event.initials}</span><span><strong>{event.actor}</strong><small>{event.email}</small></span></div></section>
    <section className="activity-detail-card"><h3>{t('activity.actionInformation')}</h3><DetailLine label={t('activity.module')} value={t(event.moduleKey)} /><DetailLine label={t('activity.action')} value={t(event.actionKey)} /><DetailLine label={t('activity.target')} value={event.target} /><DetailLine label={t('activity.result')} value={<span className={`activity-result activity-result--${event.result}`}>{event.result === 'success' ? <IconCircleCheck /> : <IconX />}{t(`activity.result.${event.result}`)}</span>} /></section>
    <section className="activity-detail-card"><h3>{t('activity.changeDetails')}</h3><p className="activity-change-label">{t('activity.changedFields')}</p>{event.changes.map(change => <div className="activity-change" key={change.field}><span>{t(change.labelKey)}</span><div><code>{change.before || t('activity.emptyValue')}</code><b aria-hidden="true">→</b><code className="activity-change__after">{change.after || t('activity.emptyValue')}</code></div></div>)}</section>
    <section className="activity-detail-card activity-detail-card--meta"><h3>{t('activity.additionalInformation')}</h3><DetailLine label={t('activity.company')} value={event.company} /><DetailLine label={t('activity.resourceType')} value={t(event.resourceKey)} /><DetailLine label={t('activity.recordId')} value={event.id} /></section>
    </div>
  </aside>
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return <div className="activity-detail-line"><span>{label}</span><strong>{value}</strong></div>
}
