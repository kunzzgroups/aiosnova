import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconCircleCheck, IconPencil, IconPlus, IconSearch, IconShield, IconTrash, IconX } from '@/components/icons/Icons'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { Button } from '@/components/ui/Button'
import { DateRangeField } from '@/components/ui/DateRangeField'
import { presetRange } from '@/components/ui/dateRange'
import { FormField } from '@/components/ui/FormField'
import { TablePagination } from '@/components/ui/TablePagination'
import { TablePanel } from '@/components/ui/TablePanel'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { useCompanyStore } from '@/stores/companyStore'
import { useActivityDetail, useActivityFilters, useActivityPage } from '../hooks/useActivityApi'
import type { ActivityEvent, ActivityFilters, ActivitySummary } from '../types/activity'
import './IdentityPage.css'
import './ActivityPage.css'

type Filters = ActivityFilters
function initialFilters(): Filters {
  return { query: '', actor: 'all', module: 'all', action: 'all', result: 'all', ...presetRange(7, new Date(), 'Asia/Singapore') }
}

const actionIcon = { created: IconPlus, updated: IconPencil, deleted: IconTrash, login: IconShield } as const

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' }).format(new Date(value))
}

export function ActivityPage() {
  const { t, i18n } = useTranslation()
  const [filterError, setFilterError] = useState('')
  const [draft, setDraft] = useState<Filters>(initialFilters)
  const [filters, setFilters] = useState<Filters>(() => draft)
  const hasUnappliedFilters = (Object.keys(draft) as (keyof Filters)[]).some(key => draft[key] !== filters[key])
  const activeCompanyId = useCompanyStore(state => state.companyId)
  const companies = useCompanyStore(state => state.companies)
  const isOwner = useAuthStore(state => state.user?.isOwner) === true
  const [scopeChoice, setScopeChoice] = useState('merchant')
  const companyId = isOwner ? scopeChoice === 'company' ? activeCompanyId : scopeChoice : activeCompanyId
  const showScope = companyId === 'merchant'
  const accessToken = useAuthStore(state => state.accessToken)
  const userId = useAuthStore(state => state.user?.id)
  const scope = JSON.stringify([companyId, userId, accessToken])
  const [selection, setSelection] = useState<{ id: string; scope: string } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(0)
  const [autoPageSize, setAutoPageSize] = useState(10)
  const tableRef = useRef<HTMLDivElement>(null)
  const effectivePageSize = pageSize || autoPageSize
  const list = useActivityPage({ companyId, ...filters, page, pageSize: effectivePageSize })
  const filterOptions = useActivityFilters(companyId)
  const authorizationError = [list.error, filterOptions.error].find(error => error instanceof ApiError && [401, 403].includes(error.status ?? 0))
  const blocked = Boolean(authorizationError)
  const loadError = authorizationError ?? list.error
  const selectedId = selection?.scope === scope && !blocked ? selection.id : ''
  const detail = useActivityDetail(companyId, selectedId)
  const pagedEvents = blocked ? [] : list.data?.items ?? []
  const total = blocked ? 0 : list.data?.total ?? 0
  const isLoading = !blocked && list.status === 'loading'
  const pageCount = Math.max(1, Math.ceil(total / effectivePageSize))
  const currentPage = list.data?.page ?? Math.min(page, pageCount)
  const options = filterOptions.data
  const scopeCompanies = options?.companies ?? []
  const scopeLabel = showScope ? t('activity.merchantScope') : scopeCompanies.find(company => company.value === companyId)?.label ?? companies.find(company => company.value === companyId)?.label ?? companyId

  useEffect(() => {
    const defaults = initialFilters()
    setDraft(defaults); setFilters(defaults); setPage(1); setSelection(null); setFilterError('')
  }, [scope])
  useEffect(() => { if (list.data && list.data.page !== page) setPage(list.data.page) }, [list.data, page])

  useEffect(() => { setPage(1) }, [effectivePageSize])
  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0 }, [currentPage, effectivePageSize])
  useEffect(() => {
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table || pageSize !== 0 || isLoading || !pagedEvents.length) return
    let timer: ReturnType<typeof setTimeout> | undefined
    function measure() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      // Measure natural rows before distributing space, so fitted heights do not
      // feed back into the capacity calculation on the next resize.
      table.style.height = 'auto'
      const header = table.querySelector('thead')
      if (header) header.style.height = 'auto'
      rows.forEach(row => { row.style.height = 'auto' })
      // Never retain a fitted row height across resize, page or request changes.
      // Even a single remaining row must be measured at its intrinsic height.
      const rowHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
      const headerHeight = header?.getBoundingClientRect().height ?? 0
      const availableHeight = container.clientHeight - headerHeight
      if (availableHeight <= 0 || !rows.length) return
      const capacity = Math.min(200, Math.max(1, Math.floor(availableHeight / rowHeight)))
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
      clearTimeout(timer)
      timer = setTimeout(measure, 150)
    }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    scheduleMeasure()
    return () => {
      observer.disconnect()
      clearTimeout(timer)
      table.style.removeProperty('height')
      table.querySelector('thead')?.style.removeProperty('height')
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [pageSize, currentPage, effectivePageSize, pagedEvents.length, isLoading, i18n.language])

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.from && draft.to && draft.from > draft.to) { setFilterError(t('activity.invalidDateRange')); return }
    setFilterError('')
    setFilters(draft)
    setPage(1)
    setSelection(null)
  }

  function resetFilters() {
    setFilterError('')
    const defaults = initialFilters()
    setDraft(defaults)
    setFilters(defaults)
    setPage(1)
    setSelection(null)
  }

  const setField = (field: keyof Filters, value: string) => setDraft(current => ({ ...current, [field]: value }))
  const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-GB'

  return (
    <section className="activity-page">
      <form className="activity-filter-panel" onSubmit={submitFilters}>
        <TableToolbar
          search={<><IconSearch aria-hidden="true" /><TextField id="activity-query" type="search" maxLength={500} value={draft.query} onChange={event => setField('query', event.target.value)} placeholder={t('activity.searchPlaceholder')} aria-label={t('activity.search')} /></>}
          filters={<div className="activity-toolbar-filters">
            <FormField label={t('activity.dateRange')} htmlFor="activity-range" className="activity-date-range"><DateRangeField id="activity-range" label={t('activity.dateRange')} timeZone="Asia/Singapore" value={{ from: draft.from, to: draft.to }} onChange={range => setDraft(current => ({ ...current, ...range }))} /></FormField>
            <div className="activity-filter-selects">
              <FilterSelect id="activity-actor" label={t('activity.actor')} value={draft.actor} onChange={value => setField('actor', value)} options={['all', ...(options?.actors.map(actor => actor.value) ?? [])]} optionLabel={value => value === 'all' ? t('activity.allActors') : options?.actors.find(actor => actor.value === value)?.label ?? value} />
              <FilterSelect id="activity-module" label={t('activity.module')} value={draft.module} onChange={value => setField('module', value)} options={['all', ...(options?.modules ?? [])]} optionLabel={value => value === 'all' ? t('activity.allModules') : t(`activity.module.${value}`, { defaultValue: value })} />
              <FilterSelect id="activity-action" label={t('activity.action')} value={draft.action} onChange={value => setField('action', value)} options={['all', ...(options?.actions ?? [])]} optionLabel={value => value === 'all' ? t('activity.allActions') : t(`activity.action.${value}`, { defaultValue: value })} />
              <FilterSelect id="activity-result" label={t('activity.result')} value={draft.result} onChange={value => setField('result', value)} options={['all', ...(options?.results ?? [])]} optionLabel={value => value === 'all' ? t('activity.allResults') : t(`activity.result.${value}`, { defaultValue: value })} />
            </div>
          </div>}
          actions={<><Button variant="secondary" onClick={resetFilters}><IconX aria-hidden="true" />{t('activity.reset')}</Button><Button type="submit"><IconSearch aria-hidden="true" />{t('activity.searchAction')}</Button></>}
        />
        {filterOptions.error && !blocked && list.status === 'ready' && <ActivityReadState error={filterOptions.error} onRetry={filterOptions.retry} compact />}
        {filterError && <p className="activity-filter-error" role="alert">{filterError}</p>}
        <div className="activity-filter-pending" role="status" aria-live="polite">
          {hasUnappliedFilters && <span>{t('activity.unappliedFilters')}</span>}
        </div>
      </form>

      <div className={`activity-content${selectedId ? ' activity-content--details-open' : ''}`}>
        <TablePanel className="activity-log" aria-busy={isLoading}>
          <header className="activity-log__header">
            <div><h2>{t('activity.logTitle')}</h2><span className="activity-count">{isLoading ? t('activity.loading') : list.data && !blocked ? t('activity.recordCount', { count: total }) : '—'}</span></div>
            {isOwner ? <div className="activity-scope-picker ui-table-filter"><FilterSelect id="activity-scope" label={t('activity.viewScope')} value={companyId} onChange={setScopeChoice} options={['merchant', ...scopeCompanies.map(company => company.value)]} optionLabel={value => value === 'merchant' ? t('activity.merchantScope') : scopeCompanies.find(company => company.value === value)?.label ?? value} /></div> : <span className="activity-log__scope">{t('activity.viewScope')}: {scopeLabel}</span>}
          </header>
          <div className="activity-table-scroll identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label={t('activity.logTitle')}>
            <table className="activity-table">
              <thead><tr><th>{t('activity.dateTime')} <span className="activity-timezone">(UTC+8)</span></th><th>{t('activity.actor')}</th>{showScope && <th>{t('activity.eventScope')}</th>}<th>{t('activity.module')}</th><th>{t('activity.action')}</th><th>{t('activity.target')}</th><th>{t('activity.result')}</th></tr></thead>
              <tbody>
                {pagedEvents.map(event => <ActivityRow key={event.id} event={event} showScope={showScope} selected={selectedId === event.id} locale={locale} onSelect={() => setSelection({ id: event.id, scope })} />)}
                {isLoading && <tr className="activity-state-row"><td colSpan={showScope ? 7 : 6}><ActivityReadState loading /></td></tr>}
                {Boolean(loadError) && <tr className="activity-state-row"><td colSpan={showScope ? 7 : 6}><ActivityReadState error={loadError} onRetry={list.retry} /></td></tr>}
                {!companyId && <tr className="activity-state-row"><td colSpan={showScope ? 7 : 6} className="activity-empty">{t('activity.selectCompany')}</td></tr>}
                {list.status === 'ready' && !blocked && total === 0 && <tr className="activity-state-row"><td colSpan={showScope ? 7 : 6} className="activity-empty" role="status">{t('activity.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
          {companyId && !blocked && <div className="activity-pagination-slot" inert={isLoading || list.status !== 'ready'} aria-busy={isLoading}><TablePagination id="activity-page-size" total={total} pageSize={pageSize} autoPageSize={autoPageSize} effectivePageSize={effectivePageSize} currentPage={currentPage} pageCount={pageCount} pagesLabel={t('activity.pagesLabel')} translationPrefix="activity" onPageSizeChange={size => { setPageSize(size); setPage(1) }} onPageChange={setPage} /></div>}
        </TablePanel>

        {selectedId && (detail.data ? <ActivityDetails event={detail.data} locale={locale} onClose={() => setSelection(null)} /> : <aside className="activity-details" aria-label={t('activity.detailsTitle')} aria-busy={detail.status === 'loading'}>
          <header className="activity-details__pending-header"><h2>{t('activity.detailsTitle')}</h2><Button variant="ghost" size="icon" onClick={() => setSelection(null)} aria-label={t('activity.closeDetails')}><IconX aria-hidden="true" /></Button></header>
          <div className="activity-details__scroll"><ActivityReadState loading={detail.status === 'loading'} error={detail.error} onRetry={detail.retry} /></div>
        </aside>)}

      </div>
    </section>
  )
}

function ActivityReadState({ loading = false, error, onRetry, compact = false }: { loading?: boolean; error?: unknown; onRetry?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const status = error instanceof ApiError ? error.status : undefined
  const title = loading ? 'activity.loading' : status === 401 ? 'activity.sessionExpired' : status === 403 ? 'activity.accessDenied' : status === 404 ? 'activity.notAvailable' : 'activity.loadFailed'
  const retryable = !loading && ![401, 403, 404].includes(status ?? 0)
  return <div className={'activity-read-state' + (compact ? ' activity-read-state--compact' : '')} role={loading ? 'status' : 'alert'}>
    <p>{t(title)}</p>
    {!loading && <p className="activity-read-state__message">{error instanceof ApiError ? error.message : t('activity.loadError')}</p>}
    {retryable && onRetry && <Button variant="secondary" onClick={onRetry}>{t('activity.retry')}</Button>}
  </div>
}

function FilterSelect({ id, label, value, onChange, options, allLabel, optionLabel }: { id: string; label: string; value: string; onChange: (value: string) => void; options: string[]; allLabel?: string; optionLabel?: (value: string) => string }) {
  return <SidebarSelect id={id} label={label} className="activity-filter-field" value={value} onChange={onChange} options={options.map(option => ({ value: option, label: optionLabel ? optionLabel(option) : option === 'all' ? allLabel ?? option : option }))} />
}

function ActivityRow({ event, selected, locale, onSelect, showScope }: { event: ActivitySummary; selected: boolean; locale: string; onSelect: () => void; showScope: boolean }) {
  const { t } = useTranslation()
  const ActionIcon = actionIcon[event.action]
  return <tr className={selected ? 'is-selected' : undefined} aria-selected={selected} tabIndex={0} onClick={onSelect} onKeyDown={keyEvent => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') { keyEvent.preventDefault(); onSelect() } }}>
    <td className="activity-time"><time dateTime={event.occurredAt} title={formatDateTime(event.occurredAt, locale) + ' (UTC+8)'}>{formatDateTime(event.occurredAt, locale)}</time></td>
    <td><span className="activity-actor" title={event.actor}><span className="activity-avatar">{event.initials}</span><span className="activity-actor__name" tabIndex={0}>{event.actor}</span></span></td>
    {showScope && <td className="activity-event-scope" title={event.scopeKind === 'merchant' ? t('activity.merchantEvent') : event.company}>{event.scopeKind === 'merchant' ? t('activity.merchantEvent') : event.company}</td>}
    <td className="activity-module">{t(event.moduleKey)}</td>
    <td><span className={`activity-action-icon activity-action-icon--${event.action}`}><ActionIcon aria-hidden="true" /></span><span className="activity-action-label">{t(event.actionKey)}</span></td>
    <td className="activity-target" title={event.target} tabIndex={0}>{event.target}</td>
    <td><span className={`activity-result activity-result--${event.result}`}>{event.result === 'success' ? <IconCircleCheck aria-hidden="true" /> : <IconX aria-hidden="true" />}{t(`activity.result.${event.result}`)}</span></td>
  </tr>
}

function ActivityDetails({ event, locale, onClose }: { event: ActivityEvent; locale: string; onClose: () => void }) {
  const { t } = useTranslation()
  const ActionIcon = actionIcon[event.action]
  return <aside className="activity-details" aria-label={t('activity.detailsTitle')}>
    <header className="activity-details__header"><div className="activity-details__event-icon"><ActionIcon aria-hidden="true" /><span className={`activity-details__result-dot activity-details__result-dot--${event.result}`} /></div><div className="activity-details__heading"><h2>{t(event.actionKey)}{event.target && event.target !== '—' && <> · {event.target}</>}</h2><p className="activity-details__actor">{event.actor}</p><p><time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt, locale)}</time></p></div><Button variant="ghost" size="icon" className="activity-details__close" onClick={onClose} aria-label={t('activity.closeDetails')}><IconX aria-hidden="true" /></Button></header>
    <div className="activity-details__scroll" tabIndex={0} role="region" aria-label={t('activity.detailsTitle')}>
    <section className="activity-detail-card"><h3>{t('activity.actorInformation')}</h3><div className="activity-detail-actor"><span className="activity-avatar activity-avatar--large">{event.initials}</span><span><strong>{event.actor}</strong><small>{event.email}</small></span></div></section>
    <section className="activity-detail-card"><h3>{t('activity.actionInformation')}</h3><DetailLine label={t('activity.module')} value={t(event.moduleKey)} /><DetailLine label={t('activity.action')} value={t(event.actionKey)} /><DetailLine label={t('activity.target')} value={event.target} /><DetailLine label={t('activity.result')} value={<span className={`activity-result activity-result--${event.result}`}>{event.result === 'success' ? <IconCircleCheck /> : <IconX />}{t(`activity.result.${event.result}`)}</span>} /></section>
    <section className="activity-detail-card"><h3>{t('activity.changeDetails')}</h3><p className="activity-change-label">{t('activity.changedFields')}</p>{event.changes.map(change => <div className="activity-change" key={change.field}><span>{t(change.labelKey)}</span><div><code>{change.before || t('activity.emptyValue')}</code><b aria-hidden="true">→</b><code className="activity-change__after">{change.after || t('activity.emptyValue')}</code></div></div>)}</section>
    <section className="activity-detail-card activity-detail-card--meta"><h3>{t('activity.additionalInformation')}</h3><DetailLine label={t('activity.eventScope')} value={event.scopeKind === 'merchant' ? t('activity.merchantEvent') : event.company} /><DetailLine label={t('activity.resourceType')} value={t(event.resourceKey)} /><DetailLine label={t('activity.recordId')} value={event.id} /></section>
    </div>
  </aside>
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return <div className="activity-detail-line"><span>{label}</span><strong>{value}</strong></div>
}
