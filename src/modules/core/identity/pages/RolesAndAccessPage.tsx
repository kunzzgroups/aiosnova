import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField } from '@/components/ui/FormField'
import { IconButton } from '@/components/ui/IconButton'
import { TablePanel } from '@/components/ui/TablePanel'
import { TablePagination } from '@/components/ui/TablePagination'
import { TableToolbar } from '@/components/ui/TableToolbar'
import { TextField } from '@/components/ui/TextField'
import { IconAlertTriangle, IconPencil, IconPlus, IconSearch, IconShield, IconTrash } from '@/components/icons/Icons'
import { IconUsers } from '@/components/navigation/SidebarIcons'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { useCompanyStore } from '@/stores/companyStore'
import { useAuthStore } from '@/stores/authStore'
import { notifySuccess } from '@/stores/toastStore'
import { accessPermissionGroups, accessPermissionRisks, createAccessDemoRoles, type AccessDemoRole } from '../mock/rolesAndAccess'
import './IdentityPage.css'
import './UsersDirectoryDesign.css'
import './RolesAndAccessPage.css'

// Reset this isolated UI demo on account/company changes; selections do not authorize API requests.
export function RolesAndAccessPage() {
  const companyId = useCompanyStore(state => state.companyId)
  const userId = useAuthStore(state => state.user?.id)
  return <RolesAndAccessEditor key={`${userId}:${companyId}`} />
}

type RoleEditor = { id?: string; name: string; enabled: boolean; permissions: string[] }
const totalPermissions = accessPermissionGroups.reduce((sum, group) => sum + group.permissions.length, 0)
const differs = (a: string[], b: string[]) => a.length !== b.length || a.some(id => !b.includes(id))

function RiskExplanation({ explanation, children, className = '' }: { explanation: string; children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  const descriptionId = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [showHint, setShowHint] = useState(false)
  const [pinned, setPinned] = useState(false)
  const visible = showHint || pinned

  useLayoutEffect(() => {
    if (!visible || !explanation) return
    function position() {
      const anchor = anchorRef.current
      const tooltip = tooltipRef.current
      if (!anchor || !tooltip) return
      const rect = anchor.getBoundingClientRect()
      const inset = 12
      const left = Math.max(inset, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - inset))
      const above = rect.top - tooltip.offsetHeight - 8
      tooltip.style.left = `${left}px`
      tooltip.style.top = `${above >= inset ? above : Math.max(inset, Math.min(rect.bottom + 8, window.innerHeight - tooltip.offsetHeight - inset))}px`
      tooltip.style.visibility = 'visible'
    }
    function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') { setShowHint(false); setPinned(false) } }
    position()
    const observer = new ResizeObserver(position)
    if (tooltipRef.current) observer.observe(tooltipRef.current)
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    document.addEventListener('keydown', dismiss)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
      document.removeEventListener('keydown', dismiss)
    }
  }, [visible, explanation])

  return <span ref={anchorRef} className={`roles-access__permission-option ${className}`} onMouseEnter={() => setShowHint(true)} onMouseLeave={() => setShowHint(false)} onFocus={() => setShowHint(true)} onBlur={() => { setShowHint(false); setPinned(false) }}>
    {children || <button type="button" className="roles-access__group-hint" aria-describedby={descriptionId} aria-expanded={visible} onClick={() => setPinned(value => !value)}><IconShield />{t('access.groupRisk')}</button>}
    <span id={descriptionId} hidden>{explanation}</span>
    {explanation && visible && createPortal(<span ref={tooltipRef} className="roles-access__risk-tooltip" aria-hidden="true">{explanation}</span>, anchorRef.current?.closest('dialog') ?? document.body)}
  </span>
}

function PermissionOption({ id, selected, disabled, onToggle }: { id: string; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const descriptionId = useId()
  const definition = accessPermissionRisks[id]
  const explanation = definition ? t(definition.hintKey) : ''
  const destructive = definition?.kind === 'destructive'
  return <RiskExplanation explanation={explanation}>
    <Button variant="secondary" disabled={disabled} className="roles-access__permission" aria-pressed={selected} aria-describedby={definition ? descriptionId : undefined} onClick={onToggle}>
      {t(`access.${id}`)}
      {destructive && <span className="roles-access__risk" aria-hidden="true"><IconAlertTriangle /></span>}
    </Button>
    {definition && <span id={descriptionId} hidden>{explanation}</span>}
  </RiskExplanation>
}

function PermissionChoices({ permissions, onChange, idPrefix, disabled = false }: { permissions: string[]; onChange: (next: string[]) => void; idPrefix: string; disabled?: boolean }) {
  const { t } = useTranslation()
  return <div className={`roles-access__groups${disabled ? ' roles-access__groups--disabled' : ''}`} aria-disabled={disabled} title={disabled ? t('access.disabledPermissions') : undefined}>
    {accessPermissionGroups.map(group => {
      const count = group.permissions.filter(id => permissions.includes(id)).length
      const all = count === group.permissions.length
      return <section className="roles-access__group" key={group.key} aria-labelledby={`${idPrefix}-${group.key}`}>
        <header><h3 id={`${idPrefix}-${group.key}`}>{t(`access.${group.key}`)}</h3><span>{count}/{group.permissions.length}</span>
          <Button variant="ghost" disabled={disabled} onClick={() => onChange(all ? permissions.filter(id => !(group.permissions as readonly string[]).includes(id)) : [...new Set([...permissions, ...group.permissions])])}>{t(all ? 'access.clear' : 'access.selectAll')}</Button>
          {(group.key === 'accounts' || group.key === 'rolesAndAccess') && <RiskExplanation className="roles-access__group-explanation" explanation={t(group.key === 'accounts' ? 'access.accountsGroupHint' : 'access.rolesGroupHint')}>{null}</RiskExplanation>}
        </header>
        <div className="roles-access__permissions">{group.permissions.map(id => <PermissionOption key={id} id={id} selected={permissions.includes(id)} disabled={disabled} onToggle={() => onChange(permissions.includes(id) ? permissions.filter(value => value !== id) : [...permissions, id])} />)}</div>
      </section>
    })}
  </div>
}

function RolesAndAccessEditor() {
  const { t, i18n } = useTranslation()
  const ids = useId()
  const [roles, setRoles] = useState(createAccessDemoRoles)
  const [drafts, setDrafts] = useState<Record<string, string[]>>(() => Object.fromEntries(createAccessDemoRoles().map(role => [role.id, role.permissions])))
  const [selectedId, setSelectedId] = useState(roles[0].id)
  const [tab, setTab] = useState<'roles' | 'permissions'>('roles')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(0)
  const [autoPageSize, setAutoPageSize] = useState(10)
  const [editor, setEditor] = useState<RoleEditor | null>(null)
  const [nameError, setNameError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const autoFitRowMeasurement = useRef({ width: 0, height: 0 })
  const selected = roles.find(role => role.id === selectedId)
  const permissions = selected ? drafts[selected.id] : []
  const added = selected ? permissions.filter(id => !selected.permissions.includes(id)).length : 0
  const removed = selected ? selected.permissions.filter(id => !permissions.includes(id)).length : 0
  const changes = added + removed
  const hasDrafts = roles.some(role => differs(drafts[role.id], role.permissions))
  const deleteRole = roles.find(role => role.id === deleteId)
  const query = search.trim().toLocaleLowerCase()
  const filtered = roles.filter(role => (statusFilter === 'all' || role.enabled === (statusFilter === 'enabled')) && [role.name, ...role.permissions.map(id => t(`access.${id}`))].join(' ').toLocaleLowerCase().includes(query))
  const effectivePageSize = pageSize || autoPageSize
  const pageCount = Math.max(1, Math.ceil(filtered.length / effectivePageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRoles = filtered.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize)
  const editorOpen = editor !== null

  useEffect(() => { setPage(1) }, [query, statusFilter, effectivePageSize])
  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0 }, [currentPage, effectivePageSize])
  useEffect(() => {
    if (tab !== 'roles' || !filtered.length || pageSize !== 0) return
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return
    let frame = 0
    function measureRows() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr[data-role-row]'))
      if (!rows.length) return
      // Measure natural heights first so distributed space does not reduce the
      // calculated capacity on subsequent ResizeObserver callbacks.
      rows.forEach(row => row.style.removeProperty('height'))
      const width = container.clientWidth
      const headerHeight = table.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = container.clientHeight - headerHeight
      if (availableHeight <= 0) return
      if (autoFitRowMeasurement.current.width !== width) {
        autoFitRowMeasurement.current = { width, height: 0 }
      }
      // Retain page-one measurements so shorter rows on the final page do not
      // change the page size, matching the Employees and Positions tables.
      if (currentPage === 1 || !autoFitRowMeasurement.current.height) {
        const naturalHeight = Math.max(1, ...rows.map(row => row.getBoundingClientRect().height))
        autoFitRowMeasurement.current.height = Math.max(autoFitRowMeasurement.current.height, naturalHeight)
      }
      const limit = Math.max(1, Math.floor(availableHeight / autoFitRowMeasurement.current.height))
      setAutoPageSize(current => current === limit ? current : limit)
      const uniformHeight = availableHeight / limit
      rows.forEach(row => { row.style.height = uniformHeight + 'px' })
    }
    function scheduleMeasure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureRows)
    }
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(container)
    observer.observe(table)
    scheduleMeasure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      table.querySelectorAll<HTMLTableRowElement>('tbody tr[data-role-row]').forEach(row => row.style.removeProperty('height'))
    }
  }, [tab, pageSize, currentPage, effectivePageSize, filtered.length, i18n.resolvedLanguage])

  useEffect(() => {
    if (!hasDrafts && !editorOpen) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDrafts, editorOpen])

  useEffect(() => {
    if (!editorOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus() }
  }, [editorOpen])

  function update(next: string[]) {
    if (!selected?.enabled) return
    setDrafts(current => ({ ...current, [selectedId]: next }))
  }

  function toggleRole(id: string) {
    setRoles(items => items.map(role => role.id === id ? { ...role, enabled: !role.enabled } : role))
    notifySuccess(t('access.statusSaved'))
  }

  function savePermissions() {
    if (!selected?.enabled || !changes) return
    setRoles(current => current.map(role => role.id === selectedId ? { ...role, permissions: [...permissions] } : role))
    notifySuccess(t('access.saved'))
  }

  function openEditor(role?: AccessDemoRole) {
    setNameError('')
    setEditor(role ? { id: role.id, name: role.name, enabled: role.enabled, permissions: [...drafts[role.id]] } : { name: '', enabled: true, permissions: [] })
  }

  function saveRole() {
    if (!editor) return
    const name = editor.name.trim()
    if (!name) { setNameError(t('access.nameRequired')); return }
    if (roles.some(role => role.id !== editor.id && role.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setNameError(t('access.nameDuplicate')); return }
    if (editor.id) {
      // Renaming must not save or discard permission drafts or change role status.
      setRoles(items => items.map(role => role.id === editor.id ? { ...role, name } : role))
      setEditor(null)
      notifySuccess(t('access.roleRenamed'))
      return
    }
    const id = crypto.randomUUID()
    const next: AccessDemoRole = { id, name, enabled: editor.enabled, permissions: [...editor.permissions], peopleCount: 0, createdAt: new Date().toISOString() }
    setRoles(items => [...items, next])
    setDrafts(items => ({ ...items, [id]: next.permissions }))
    setSelectedId(id)
    setTab('permissions')
    setEditor(null)
    notifySuccess(t('access.roleSaved'))
  }

  return <section className="roles-access" aria-label={t('access.title')}>
    <div className="roles-access__toolbar">
      <div className="roles-access__tabs" role="tablist" aria-label={t('access.title')}>
        {(['roles', 'permissions'] as const).map(value => <button type="button" key={value} id={`${ids}-${value}-tab`} role="tab" aria-selected={tab === value} aria-controls={`${ids}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'roles' : event.key === 'End' ? 'permissions' : value === 'roles' ? 'permissions' : 'roles'
          setTab(next)
          document.getElementById(`${ids}-${next}-tab`)?.focus()
        }}>{t(`access.${value}`)}</button>)}
      </div>
      {tab === 'permissions' && <Button onClick={() => openEditor()}><IconPlus />{t('access.addRole')}</Button>}
    </div>
    <TablePanel id={`${ids}-roles-panel`} role="tabpanel" aria-labelledby={`${ids}-roles-tab`} hidden={tab !== 'roles'} className="roles-access__table-panel">
      <TableToolbar
        search={<><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('access.search')} placeholder={t('access.search')} value={search} onChange={event => setSearch(event.target.value)} /></>}
        filters={<SidebarSelect id={`${ids}-status-filter`} label={t('access.status')} value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: t('access.allStatuses') }, { value: 'enabled', label: t('access.enabled') }, { value: 'disabled', label: t('access.disabled') }]} />}
      />
      <div className="identity-table-wrap identity-directory-scroll roles-access__table-scroll" ref={tableRef} tabIndex={0} aria-label={t('access.roles')}><table className={`identity-table identity-table--packed directory-design-table roles-access__table${pageSize === 0 ? ' directory-design-table--auto-fit' : ''}`}><thead><tr>{['name', 'permissions', 'people', 'status', 'createdAt', 'actions'].map(key => <th scope="col" key={key}>{t(`access.${key}`)}</th>)}</tr></thead><tbody>
        {visibleRoles.map(role => <tr key={role.id} data-role-row>
          <td><button type="button" className="roles-access__link" onClick={() => { setSelectedId(role.id); setTab('permissions') }}>{role.name}</button></td>
          <td>{t('access.roleMeta', { count: role.permissions.length })}</td>
          <td><span className="roles-access__people-count"><IconUsers aria-hidden="true" /><span>{role.peopleCount.toLocaleString(i18n.language)}</span></span></td>
          <td className="identity-table__status"><button type="button" role="switch" aria-checked={role.enabled} className={`identity-status identity-status--${role.enabled ? 'active' : 'disabled'} identity-status--interactive`} aria-label={t(role.enabled ? 'access.disableRole' : 'access.enableRole', { name: role.name })} title={t(role.enabled ? 'access.disableRole' : 'access.enableRole', { name: role.name })} onClick={() => toggleRole(role.id)}>{t(role.enabled ? 'access.enabled' : 'access.disabled')}</button></td>
          <td className="roles-access__date">{new Intl.DateTimeFormat(i18n.resolvedLanguage, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(role.createdAt))}</td>
          <td><div className="roles-access__actions"><IconButton label={t('access.deleteRole', { name: role.name })} variant="ghost" onClick={() => setDeleteId(role.id)}><IconTrash /></IconButton></div></td>
        </tr>)}
        {!filtered.length && <tr><td colSpan={6} className="roles-access__empty">{t(roles.length ? 'access.noResults' : 'access.noRoles')}</td></tr>}
      </tbody></table></div>
      <TablePagination id={`${ids}-page-size`} total={filtered.length} pageSize={pageSize} autoPageSize={autoPageSize} effectivePageSize={effectivePageSize} currentPage={currentPage} pageCount={pageCount} pagesLabel={t('access.rolePages')} onPageSizeChange={setPageSize} onPageChange={setPage} />
    </TablePanel>
    <div className="roles-access__permission-tab" id={`${ids}-permissions-panel`} role="tabpanel" aria-labelledby={`${ids}-permissions-tab`} hidden={tab !== 'permissions'}>
      <div className="roles-access__workspace">
        <aside className="roles-access__sidebar" aria-label={t('access.roles')}>
          <div className="roles-access__list-heading">{t('access.roles')}<span>{roles.length}</span></div>
          <div className="roles-access__role-list" tabIndex={0} role="region" aria-label={t('access.roles')}>
          {roles.map(role => <button type="button" className="roles-access__role" key={role.id} aria-pressed={selectedId === role.id} onClick={() => setSelectedId(role.id)}>
            <strong>{role.name}</strong><span>{t('access.roleMeta', { count: drafts[role.id].length })} · {t(role.enabled ? 'access.enabled' : 'access.disabled')}{differs(drafts[role.id], role.permissions) ? ` · ${t('access.unsaved')}` : ''}</span>
          </button>)}
          </div>
        </aside>
        <div className="roles-access__panel">
          {selected ? <>
            <header className="roles-access__role-heading">
              <div className="roles-access__name"><h2>{selected.name}</h2><button type="button" role="switch" aria-checked={selected.enabled} className={`identity-status identity-status--${selected.enabled ? 'active' : 'disabled'} identity-status--interactive`} aria-label={t(selected.enabled ? 'access.disableRole' : 'access.enableRole', { name: selected.name })} title={t(selected.enabled ? 'access.disableRole' : 'access.enableRole', { name: selected.name })} onClick={() => toggleRole(selected.id)}>{t(selected.enabled ? 'access.enabled' : 'access.disabled')}</button><Button className="roles-access__edit" variant="ghost" onClick={() => openEditor(selected)}><IconPencil />{t('access.edit')}</Button></div>
              <div className="roles-access__summary"><span>{t('access.granted', { count: permissions.length, total: totalPermissions })}</span><span>{t(selected.enabled ? 'access.toggleHint' : 'access.disabledPermissions')}</span></div>
            </header>
            <PermissionChoices permissions={permissions} onChange={update} idPrefix={`${ids}-selection`} disabled={!selected.enabled} />
            <footer className="roles-access__footer">
              <div className="roles-access__feedback" role="status">{changes ? <>{t('access.changes', { count: changes })}<small>{t('access.changeDetails', { added, removed })}</small></> : t('access.noChanges')}</div>
              <div className="roles-access__actions"><Button variant="ghost" disabled={!selected.enabled || !changes} onClick={() => update([...selected.permissions])}>{t('access.discard')}</Button><Button disabled={!selected.enabled || !changes} onClick={savePermissions}>{t('access.save')}{changes ? ` · ${changes}` : ''}</Button></div>
            </footer>
          </> : <p className="roles-access__empty">{t('access.noRoles')}</p>}
        </div>
      </div>
    </div>
    {editor && <dialog ref={dialogRef} className="roles-access__dialog" aria-labelledby={`${ids}-editor-title`} onCancel={() => setEditor(null)}>
      <form onSubmit={event => { event.preventDefault(); saveRole() }}>
        <h2 id={`${ids}-editor-title`}>{t(editor.id ? 'access.edit' : 'access.addRole')}</h2>
        <div className="roles-access__fields">
          <FormField htmlFor={`${ids}-name`} label={t('access.roleName')} error={nameError}><TextField id={`${ids}-name`} autoFocus required maxLength={80} placeholder={t('access.roleNamePlaceholder')} value={editor.name} hasError={!!nameError} aria-invalid={!!nameError} aria-describedby={nameError ? `${ids}-name-error` : undefined} onChange={event => { setEditor({ ...editor, name: event.target.value }); setNameError('') }} /></FormField>
          {!editor.id && <div className="roles-access__editor-status"><span id={`${ids}-status-label`}>{t('access.status')}</span><label className="identity-invite-switch"><input type="checkbox" role="switch" aria-labelledby={`${ids}-status-label`} checked={editor.enabled} onChange={event => setEditor({ ...editor, enabled: event.target.checked })} />{t(editor.enabled ? 'access.enabled' : 'access.disabled')}</label></div>}
        </div>
        {!editor.id && <>
          <div className="roles-access__form-permissions"><h3>{t('access.permissions')}</h3><span role="status">{t('access.selectedCount', { count: editor.permissions.length, total: totalPermissions })}</span></div>
          <PermissionChoices permissions={editor.permissions} onChange={next => { if (editor.enabled) setEditor({ ...editor, permissions: next }) }} idPrefix={`${ids}-editor`} disabled={!editor.enabled} />
        </>}
        <footer className="roles-access__footer"><div className="roles-access__actions"><Button variant="ghost" onClick={() => setEditor(null)}>{t('access.cancel')}</Button><Button type="submit">{t(editor.id ? 'access.rename' : 'access.saveRole')}</Button></div></footer>
      </form>
    </dialog>}
    <ConfirmDialog open={!!deleteRole} variant="deletion" title={t('access.deleteTitle')} description={deleteRole?.peopleCount ? t('access.deleteAssigned', { count: deleteRole.peopleCount, name: deleteRole.name }) : t('access.deleteConfirm', { name: deleteRole?.name })} confirmLabel={t('access.delete')} confirmDisabled={!!deleteRole?.peopleCount} onCancel={() => setDeleteId(null)} onConfirm={() => {
      if (!deleteRole || deleteRole.peopleCount) return
      const remaining = roles.filter(role => role.id !== deleteRole.id)
      setRoles(remaining)
      setDrafts(current => { const next = { ...current }; delete next[deleteRole.id]; return next })
      if (selectedId === deleteRole.id) setSelectedId(remaining[0]?.id ?? '')
      setDeleteId(null)
      notifySuccess(t('access.roleDeleted'))
    }} />
  </section>
}
