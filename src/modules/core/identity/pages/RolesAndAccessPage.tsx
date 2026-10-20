import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField } from '@/components/ui/FormField'
import { IconButton } from '@/components/ui/IconButton'
import { TextField } from '@/components/ui/TextField'
import { IconAlertTriangle, IconChevronDown, IconCircleCheck, IconPencil, IconPlus, IconSearch, IconShield, IconTrash, IconX } from '@/components/icons/Icons'
import { useCompanyStore } from '@/stores/companyStore'
import { useAuthStore } from '@/stores/authStore'
import { notifySuccess } from '@/stores/toastStore'

import { accessPermissionGroups, accessPermissionRisks, createAccessDemoRoles, type AccessDemoRole } from '../mock/rolesAndAccess'
import './IdentityPage.css'
import './RolesAndAccessPage.css'

// Reset this isolated UI demo on account/company changes; selections do not authorize API requests.
export function RolesAndAccessPage() {
  const companyId = useCompanyStore(state => state.companyId)
  const userId = useAuthStore(state => state.user?.id)
  return <RolesAndAccessEditor key={`${userId}:${companyId}`} />
}

type RoleEditor = { name: string; enabled: boolean; permissions: string[] }
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

function PermissionChoices({ permissions, onChange, idPrefix, disabled = false, query = '' }: { permissions: string[]; onChange: (next: string[]) => void; idPrefix: string; disabled?: boolean; query?: string }) {
  const { t } = useTranslation()
  const searchQuery = query.trim().toLocaleLowerCase()
  const matchesSystem = t('access.system').toLocaleLowerCase().includes(searchQuery)
  const matchingPermissions = accessPermissionGroups.flatMap(group => group.permissions.filter(id => matchesSystem || t(`access.${group.key}`, { defaultValue: group.key }).toLocaleLowerCase().includes(searchQuery) || t(`access.${id}`, { defaultValue: id }).toLocaleLowerCase().includes(searchQuery)))
  const allSystemSelected = matchingPermissions.every(id => permissions.includes(id))
  const hasResults = matchesSystem || accessPermissionGroups.some(group => t(`access.${group.key}`, { defaultValue: group.key }).toLocaleLowerCase().includes(searchQuery) || group.permissions.some(id => t(`access.${id}`, { defaultValue: id }).toLocaleLowerCase().includes(searchQuery)))
  return <div className={`roles-access__groups${disabled ? ' roles-access__groups--disabled' : ''}`} aria-disabled={disabled} title={disabled ? t('access.disabledPermissions') : undefined}>
    {!hasResults && <p className="roles-access__empty" role="status">{t('access.noPermissionResults')}</p>}
    {hasResults && <div className="roles-access__tree-wrapper"><details className="roles-access__system-tree" key={`${idPrefix}-${searchQuery}`} open={searchQuery.length > 0}>
    <summary><IconChevronDown aria-hidden="true" /><IconShield aria-hidden="true" /><span>{t('access.system')}</span><span className="roles-access__tree-count">{permissions.length}/{accessPermissionGroups.reduce((sum, group) => sum + group.permissions.length, 0)}</span><Button className="roles-access__tree-select" variant="ghost" disabled={disabled} onClick={event => { event.preventDefault(); event.stopPropagation(); onChange(allSystemSelected ? permissions.filter(id => !(matchingPermissions as string[]).includes(id)) : [...new Set([...permissions, ...matchingPermissions])]); }}>{t(allSystemSelected ? 'access.clear' : 'access.selectAll')}</Button></summary>

    <div className="roles-access__tree-children">
    {accessPermissionGroups.map(group => {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      const visible: readonly string[] = group.permissions.filter(id => matchesSystem || t(`access.${group.key}`, { defaultValue: group.key }).toLocaleLowerCase().includes(normalizedQuery) || t(`access.${id}`, { defaultValue: id }).toLocaleLowerCase().includes(normalizedQuery))
      if (!visible.length) return null
      const count = group.permissions.filter(id => permissions.includes(id)).length
      const all = visible.every(id => permissions.includes(id))
      return <div className="roles-access__tree-wrapper roles-access__tree-wrapper--category" key={group.key}><details className="roles-access__group roles-access__tree-group" open={searchQuery.length > 0}>
        <summary><IconChevronDown aria-hidden="true" /><span id={`${idPrefix}-${group.key}`}>{t(`access.${group.key}`)}</span><span className="roles-access__tree-count">{count}/{group.permissions.length}</span><Button className="roles-access__tree-select" variant="ghost" disabled={disabled} onClick={event => { event.preventDefault(); event.stopPropagation(); onChange(all ? permissions.filter(id => !visible.includes(id)) : [...new Set([...permissions, ...visible])]); }}>{t(all ? 'access.clear' : 'access.selectAll')}</Button>          {(group.key === 'accounts' || group.key === 'rolesAndAccess') && <span className="roles-access__heading-hint" onClick={event => { event.preventDefault(); event.stopPropagation() }}><RiskExplanation className="roles-access__group-explanation" explanation={t(group.key === 'accounts' ? 'access.accountsGroupHint' : 'access.rolesGroupHint')}>{null}</RiskExplanation></span>}</summary>

        <div className="roles-access__permissions">{visible.map(id => <PermissionOption key={id} id={id} selected={permissions.includes(id)} disabled={disabled} onToggle={() => onChange(permissions.includes(id) ? permissions.filter(value => value !== id) : [...permissions, id])} />)}</div>
      </details></div>
    })}
    </div></details></div>}
  </div>
}

function RolesAndAccessEditor() {
  const { t } = useTranslation()
  const ids = useId()
  const [roles, setRoles] = useState(createAccessDemoRoles)
  const [drafts, setDrafts] = useState<Record<string, string[]>>(() => Object.fromEntries(createAccessDemoRoles().map(role => [role.id, role.permissions])))
  const [selectedId, setSelectedId] = useState(roles[0].id)
  const [editor, setEditor] = useState<RoleEditor | null>(null)
  const [nameError, setNameError] = useState('')
  const [inlineName, setInlineName] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState('')
  const [accessSearch, setAccessSearch] = useState('')
  useEffect(() => { setInlineName(null); setInlineError(''); setAccessSearch('') }, [selectedId])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const selected = roles.find(role => role.id === selectedId)
  const permissions = selected ? drafts[selected.id] : []
  const added = selected ? permissions.filter(id => !selected.permissions.includes(id)).length : 0
  const removed = selected ? selected.permissions.filter(id => !permissions.includes(id)).length : 0
  const changes = added + removed
  const hasDrafts = roles.some(role => differs(drafts[role.id], role.permissions))
  const deleteRole = roles.find(role => role.id === deleteId)
  const editorOpen = editor !== null

  useEffect(() => {
    if (!hasDrafts && !editorOpen) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDrafts, editorOpen])


  function update(next: string[]) {
    if (!selected?.enabled) return
    setDrafts(current => ({ ...current, [selectedId]: next }))
  }

  function toggleRole(id: string) {
    setRoles(items => items.map(role => role.id === id ? { ...role, enabled: !role.enabled } : role))
    notifySuccess(t('access.statusSaved'))
  }

  function saveInlineName() {
    if (inlineName === null || !selected) return
    const name = inlineName.trim()
    if (name === selected.name) return
    if (!name) { setInlineError(t('access.nameRequired')); return }
    if (roles.some(role => role.id !== selected.id && role.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setInlineError(t('access.nameDuplicate')); return }
    setRoles(current => current.map(role => role.id === selected.id ? { ...role, name } : role))
    setInlineName(null)
    setInlineError('')
    notifySuccess(t('access.roleRenamed'))
  }

  function savePermissions() {
    if (!selected?.enabled || !changes) return
    setRoles(current => current.map(role => role.id === selectedId ? { ...role, permissions: [...permissions] } : role))
    notifySuccess(t('access.saved'))
  }

  function openEditor() {
    setNameError('')
    if (!editor) setEditor({ name: '', enabled: true, permissions: [] })
    setSelectedId('__new__')
  }

  function saveRole() {
    if (!editor) return
    const name = editor.name.trim()
    if (!name) { setNameError(t('access.nameRequired')); return }
    if (roles.some(role => role.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setNameError(t('access.nameDuplicate')); return }
    const id = crypto.randomUUID()
    const next: AccessDemoRole = { id, name, enabled: editor.enabled, permissions: [...editor.permissions], peopleCount: 0, createdAt: new Date().toISOString() }
    setRoles(items => [...items, next])
    setDrafts(items => ({ ...items, [id]: next.permissions }))
    setSelectedId(id)

    setEditor(null)
    notifySuccess(t('access.roleSaved'))
  }

  return <section className="roles-access" aria-label={t('access.title')}>
    <div className="roles-access__content">
      <div className="roles-access__workspace">
        <aside className="roles-access__sidebar" aria-label={t('access.roles')}>
          <div className="roles-access__list-heading"><span>{t('access.roles')}</span><span>{roles.length}</span></div><div className="roles-access__add-wrap"><Button variant="ghost" className="roles-access__add-role" aria-pressed={selectedId === '__new__'} onClick={openEditor}><span className="roles-access__add-label"><span className="roles-access__add-title"><IconPlus />{t('access.addRole')}</span></span><span className="roles-access__add-description">{t('access.createNewRole')}</span></Button></div>
          <div className="roles-access__role-list" tabIndex={0} role="region" aria-label={t('access.roles')}>
            {roles.map(role => <button type="button" className="roles-access__role" key={role.id} aria-pressed={selectedId === role.id} onClick={() => setSelectedId(role.id)}>
              <strong>{role.name}</strong><span>{t('access.roleMeta', { count: drafts[role.id].length })} · {t(role.enabled ? 'access.enabled' : 'access.disabled')}{differs(drafts[role.id], role.permissions) ? ` · ${t('access.unsaved')}` : ''}</span>
            </button>)}
          </div>
        </aside>
        <div className="roles-access__panel">
          {editor && selectedId === '__new__' ? <form className="roles-access__create-panel" onSubmit={event => { event.preventDefault(); saveRole() }}>
            <header className="roles-access__role-heading">
              <div className="roles-access__create-fields"><FormField className="roles-access__name-field" htmlFor={`${ids}-new-name`} label={t('access.roleName')} error={nameError}><TextField id={`${ids}-new-name`} autoFocus required maxLength={80} placeholder={t('access.roleNamePlaceholder')} value={editor.name} hasError={!!nameError} aria-invalid={!!nameError} aria-describedby={nameError ? `${ids}-new-name-error` : undefined} onChange={event => { setEditor({ ...editor, name: event.target.value }); setNameError('') }} /></FormField>
                <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={editor.enabled} aria-label={t('access.status')} onChange={event => setEditor({ ...editor, enabled: event.target.checked })} />{t(editor.enabled ? 'access.enabled' : 'access.disabled')}</label>
              </div>
              <div className="roles-access__search-row"><div className="roles-access__access-search"><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('access.searchPermissionCategories')} placeholder={t('access.searchPermissionCategories')} value={accessSearch} onChange={event => setAccessSearch(event.target.value)} /></div><span className="roles-access__selected-total" role="status">{t('access.granted', { count: editor.permissions.length, total: totalPermissions })}</span></div>
            </header>
            <PermissionChoices permissions={editor.permissions} onChange={next => setEditor({ ...editor, permissions: next })} idPrefix={`${ids}-create`} query={accessSearch} />
            <footer className="roles-access__footer"><div className="roles-access__actions"><Button variant="ghost" onClick={() => { setEditor(null); setNameError(''); setSelectedId(roles[0]?.id ?? '') }}>{t('access.cancel')}</Button><Button type="submit">{t('access.saveRole')}</Button></div></footer>
          </form> : selected ? <>
            <header className="roles-access__role-heading">
              <div className="roles-access__name">
                <div className="roles-access__inline-title">
                  {inlineName !== null ? <form className="roles-access__inline-form" onSubmit={event => { event.preventDefault(); saveInlineName() }}>
                    <TextField autoFocus aria-label={t('access.roleName')} maxLength={80} value={inlineName} hasError={!!inlineError} aria-invalid={!!inlineError} aria-describedby={inlineError ? `${ids}-inline-error` : undefined} onChange={event => { setInlineName(event.target.value); setInlineError('') }} onKeyDown={event => { if (event.key === 'Escape') { setInlineName(null); setInlineError('') } }} />
                    <IconButton type="submit" variant="secondary" label={t('access.rename')} disabled={inlineName.trim() === selected.name}><IconCircleCheck /></IconButton><IconButton variant="ghost" label={t('access.cancel')} onClick={() => { setInlineName(null); setInlineError('') }}><IconX /></IconButton>
                  </form> : <><h2>{selected.name}</h2><IconButton label={t('access.editRole', { name: selected.name })} variant="ghost" onClick={() => { setInlineName(selected.name); setInlineError('') }}><IconPencil /></IconButton></>}
                  {inlineError && <p id={`${ids}-inline-error`} role="alert">{inlineError}</p>}
                </div>
                <div className="roles-access__role-actions">
                  <IconButton variant="ghost" className="roles-access__delete" aria-disabled={selected.enabled || selected.peopleCount > 0} label={selected.enabled ? t('access.disableBeforeDelete') : selected.peopleCount > 0 ? t('access.deleteAssigned', { count: selected.peopleCount, name: selected.name }) : t('access.deleteRole', { name: selected.name })} onClick={() => { if (!selected.enabled && selected.peopleCount === 0) setDeleteId(selected.id) }}><IconTrash /></IconButton>
                  <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={selected.enabled} aria-label={t('access.statusForRole', { name: selected.name })} onChange={() => toggleRole(selected.id)} />{t(selected.enabled ? 'access.enabled' : 'access.disabled')}</label>
                </div>
              </div>
              <div className="roles-access__search-row"><div className="roles-access__access-search"><IconSearch aria-hidden="true" /><TextField type="search" aria-label={t('access.searchPermissionCategories')} placeholder={t('access.searchPermissionCategories')} value={accessSearch} onChange={event => setAccessSearch(event.target.value)} /></div><span className="roles-access__selected-total" role="status">{t('access.granted', { count: permissions.length, total: totalPermissions })}</span></div>
            </header>
            <PermissionChoices permissions={permissions} onChange={update} idPrefix={`${ids}-selection`} query={accessSearch} disabled={!selected.enabled} />
            <footer className="roles-access__footer">
              <div className="roles-access__feedback" role="status">{changes ? <>{t('access.changes', { count: changes })}<small>{t('access.changeDetails', { added, removed })}</small></> : t('access.noChanges')}</div>
              <div className="roles-access__actions"><Button variant="ghost" disabled={!selected.enabled || !changes} onClick={() => update([...selected.permissions])}>{t('access.discard')}</Button><Button disabled={!selected.enabled || !changes} onClick={savePermissions}>{t('access.save')}{changes ? ` · ${changes}` : ''}</Button></div>
            </footer>
          </> : <p className="roles-access__empty">{t('access.noRoles')}</p>}
        </div>
      </div>
    </div>
    <ConfirmDialog open={!!deleteRole} variant="deletion" title={t('access.deleteTitle')} description={deleteRole?.peopleCount ? t('access.deleteAssigned', { count: deleteRole.peopleCount, name: deleteRole.name }) : t('access.deleteConfirm', { name: deleteRole?.name })} confirmLabel={t('access.delete')} confirmDisabled={!!deleteRole?.enabled || !!deleteRole?.peopleCount} onCancel={() => setDeleteId(null)} onConfirm={() => {
      if (!deleteRole || deleteRole.enabled || deleteRole.peopleCount) return
      const remaining = roles.filter(role => role.id !== deleteRole.id)
      setRoles(remaining)
      setDrafts(current => { const next = { ...current }; delete next[deleteRole.id]; return next })
      if (selectedId === deleteRole.id) setSelectedId(remaining[0]?.id ?? '')
      setDeleteId(null)
      notifySuccess(t('access.roleDeleted'))
    }} />
  </section>
}
