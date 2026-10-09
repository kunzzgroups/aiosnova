import { useCallback,useContext,useEffect,useMemo,useRef,useState,type FormEvent } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Popover } from '@/components/ui/Popover'
import { IconBuilding } from '@/components/navigation/SidebarIcons'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import {
  IconShieldCheck,
  IconClock,
  IconShieldOff,
  IconEye,
  IconPencil,
  IconTrash,
} from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import type { CompanyListItem } from '@/modules/core/identity/services/identityService'
import type { IdentityUser,UserStatus,InvitationOptions,InvitationAssignment,InvitationPayload } from '@/modules/core/identity/types/identity'
import {
  formatStatusLabel,
} from '@/modules/core/identity/types/identity'
import {
  createUser,
  updateInvitation,
  deleteUser,
  fetchCompanies,
  fetchInvitationOptions,
  fetchMemberships,
  fetchUsers,
  updateUser,
} from '@/modules/core/identity/services/identityService'
import { AppShellHeaderContext } from '@/layouts/AppShell'
import './IdentityPage.css'
import './UsersDirectoryDesign.css'


type InviteField = 'email' | 'name' | 'department' | 'position' | 'company'
const INVITE_FIELD_IDS: Record<InviteField, string> = { email: 'user-email', name: 'user-name', department: 'user-department', position: 'user-position', company: 'user-company' }

type SortKey = 'employee' | 'companies' | 'status' | 'mfa' | 'created' | 'createdBy'
const STATUS_FILTERS=['all','active','invited','draft','disabled'] as const

const MFA_FILTERS=['all','enabled','disabled'] as const


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

function matchesSearch(user: IdentityUser,query: string) {
  if(!query) {
    return true
  }
  const haystack=`${user.displayName} ${user.fullName} ${user.email}`.toLowerCase()
  return haystack.includes(query)
}

export function UsersPage() {
  const { t, i18n }=useTranslation()
  const setShellHeader = useContext(AppShellHeaderContext)
  const invitationMessage = (locale: string) => t('users.defaultInvitationMessage', { lng: locale })
  const navigate=useNavigate()

  // Filter values are plain strings in the module-level constant; labels are
  // resolved here so they follow the active locale.
  const statusLabel=(value: string) =>
    value==='all'? t('users.filterAll'):formatStatusLabel(value,t)
  const mfaLabel=(value: string) =>
    value==='all'
      ? t('users.filterAll')
      :value==='enabled'
        ? t('users.mfaEnabled')
        :t('users.mfaDisabled')
  const sessionUser=useAuthStore((state) => state.user)
  const [users,setUsers]=useState<IdentityUser[]>([])
  const [companies,setCompanies]=useState<CompanyListItem[]>([])
  const [email,setEmail]=useState('')
  const [fullName,setFullName]=useState('')
  const [phone,setPhone]=useState('')
  const [requireMfa,setRequireMfa]=useState(false)
  const [canInvite,setCanInvite]=useState(false)
  const [language,setLanguage]=useState('en')
  const [personalMessage,setPersonalMessage]=useState(invitationMessage('en'))
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [assignments,setAssignments]=useState<InvitationAssignment[]>([])
  const [inviteOptions,setInviteOptions]=useState<InvitationOptions|null>(null)
  const [memberships,setMemberships]=useState<Awaited<ReturnType<typeof fetchMemberships>>['items']>([])
  // Zero represents automatic sizing; numeric choices keep their explicit limit.
  const [pageSize,setPageSize]=useState(0)
  const [sort,setSort]=useState<{ key: SortKey; descending: boolean }>({ key:'employee',descending:false })
  const [autoPageSize,setAutoPageSize]=useState(10)
  const autoFitRowMeasurement=useRef({ width: 0, height: 0 })
  const [page,setPage]=useState(1)
  const department = inviteOptions?.departments.find(d => d.id === departmentId)
  const tableRef=useRef<HTMLDivElement>(null)
  const invitePageRef=useRef<HTMLDivElement>(null)
  const mfaRequiredByPolicy=assignments.some(a => inviteOptions?.companies.find(c => c.id===a.companyId)?.requireMfa)
  const isOwner=users.some(u => u.id===sessionUser?.id&&u.isOwner)
  const canManageUsers=isOwner||users.some(u => u.id===sessionUser?.id&&u.canManageUsers)
  // Replace the owner fallback with the Permissions-module capability when available.
  const canManageUserStatus = isOwner
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('active')
  const [companyFilter,setCompanyFilter]=useState('all')
  const [mfaFilter,setMfaFilter]=useState('all')
  const [showInvite,setShowInvite]=useState(false)
  const [fieldErrors,setFieldErrors]=useState<Partial<Record<InviteField,string>>>({})
  const [editingDraftId,setEditingDraftId]=useState<string|null>(null)
  useEffect(() => {
    setShellHeader(showInvite ? { titleKey: editingDraftId ? 'users.editDraft' : 'users.inviteTitle', descriptionKey: 'users.inviteDescription' } : null)
    return () => setShellHeader(null)
  }, [showInvite,editingDraftId,setShellHeader])
  const [error,setError]=useState<string|null>(null)
  const [message,setMessage]=useState<string|null>(null)
  const [isLoading,setIsLoading]=useState(true)
  const [isSubmitting,setIsSubmitting]=useState(false)
  const [statusUpdatingId,setStatusUpdatingId]=useState<string|null>(null)
  const [deletingId,setDeletingId]=useState<string|null>(null)
  const [pendingDelete,setPendingDelete]=useState<IdentityUser|null>(null)

  const loadUsers=useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [usersResult,companiesResult,optionsResult,membershipsResult]=await Promise.all([fetchUsers(),fetchCompanies(),fetchInvitationOptions(),fetchMemberships()])
      setUsers(usersResult.items)
      const activeCompanies=companiesResult.items.filter((item) => item.status==='active')
      setCompanies(activeCompanies)
      setInviteOptions(optionsResult)
      setMemberships(membershipsResult.items)
    } catch(err) {
      setError(err instanceof ApiError? err.message:t('users.errLoad'))
    } finally {
      setIsLoading(false)
    }
  },[])

  useEffect(() => {
    void loadUsers()
  },[loadUsers])

  useEffect(() => {
    if(!message) {
      return
    }
    const timeoutId=window.setTimeout(() => setMessage(null),2000)
    return () => window.clearTimeout(timeoutId)
  },[message])

  const companyNamesFor=(userId: string) => memberships.filter(m => m.userId===userId).map(m => companies.find(c => c.id===m.companyId)?.name||'').filter(Boolean)

  function sortHeading(key: SortKey,label: string) {
    return <button className="directory-design-sort" onClick={() => setSort({ key,descending:sort.key===key&&!sort.descending })}>{label}<span aria-hidden="true">{sort.key===key&&sort.descending ? '↓' : '↑'}</span></button>
  }

  const filteredUsers=useMemo(() => {
    const normalizedQuery=query.trim().toLowerCase()
    return users.filter((user) => {
      if(user.isOwner&&user.id!==sessionUser?.id&&!canManageUsers) return false
      if(!matchesSearch(user,normalizedQuery)) {
        return false
      }
      if(companyFilter!=='all'&&!memberships.some(m => m.userId===user.id&&m.companyId===companyFilter)) return false
      if(statusFilter!=='all'&&user.status!==statusFilter) {
        return false
      }
      if(mfaFilter==='enabled'&&(!user.signInMethod||!user.mfaEnabled)) {
        return false
      }
      if(mfaFilter==='disabled'&&(!user.signInMethod||user.mfaEnabled)) {
        return false
      }
      return true
    }).sort((a,b) => {
      const self=Number(b.id===sessionUser?.id)-Number(a.id===sessionUser?.id)
      if (self) return self
      const value=(user: IdentityUser) => {
        switch(sort.key) {
          case 'employee': return user.displayName
          case 'companies': return companyNamesFor(user.id).join(', ')
          case 'status': return formatStatusLabel(user.status,t)
          case 'mfa': return user.signInMethod ? mfaLabel(user.mfaEnabled ? 'enabled' : 'disabled') : ''
          case 'createdBy': return user.createdBy||''
          case 'created': return new Date(user.createdAt).getTime()
        }
      }
      const left=value(a),right=value(b)
      const order=typeof left==='number'&&typeof right==='number' ? left-right : String(left).localeCompare(String(right),i18n.language)
      return sort.descending ? -order : order
    })
  },[users,query,statusFilter,companyFilter,mfaFilter,memberships,companies,sessionUser?.id,canManageUsers,sort,i18n.language,t])

  function clearFieldError(field: InviteField) {
    setFieldErrors(current => ({ ...current, [field]: undefined }))
  }

  function resetInviteForm() {
    setFieldErrors({})
    setEditingDraftId(null)
    setEmail('')
    setFullName(''); setPhone(''); setRequireMfa(false); setCanInvite(false)
    setDepartmentId(''); setPositionId(''); setAssignments([]); setLanguage('en'); setPersonalMessage(invitationMessage('en'))
  }

  function openDraft(user: IdentityUser) {
    if (!isOwner || user.status !== 'draft') return
    setFieldErrors({})
    const draft = user.invitationDraft
    const savedAssignments = draft?.assignments ?? memberships.filter(m => m.userId === user.id).map(m => ({
      companyId: m.companyId || '', organizationId: m.organizationId || '', positionId: m.positionId || '', roleIds: m.roleIds || [],
    }))
    setEditingDraftId(user.id)
    setEmail(draft?.email ?? user.email)
    setFullName(draft?.fullName ?? user.fullName)
    setPhone(draft?.phone ?? user.phone)
    setDepartmentId(draft?.departmentId ?? savedAssignments[0]?.organizationId ?? '')
    setPositionId(draft?.positionId ?? savedAssignments[0]?.positionId ?? '')
    setAssignments(savedAssignments.map(a => ({ ...a, roleIds: [...a.roleIds] })))
    setRequireMfa(draft?.requireMfa ?? user.requireMfa ?? false)
    setCanInvite(draft?.canInvite ?? user.canInvite ?? false)
    const settings = draft?.settings ?? user.invitationSettings
    setLanguage(settings?.language ?? 'en')
    setPersonalMessage(settings?.personalMessage ?? invitationMessage('en'))
    setError(null)
    setShowInvite(true)
  }

  function handleToggleInvite() {
    setShowInvite((open) => {
      if(open) {
        resetInviteForm()
      }
      return !open
    })
    setError(null)
  }

  const effectivePageSize=pageSize || autoPageSize
  const pageCount=Math.max(1,Math.ceil(filteredUsers.length/effectivePageSize))
  const currentPage=Math.min(page,pageCount)
  const visibleUsers=filteredUsers.slice((currentPage-1)*effectivePageSize,currentPage*effectivePageSize)
  useEffect(() => { setPage(1) },[query,statusFilter,companyFilter,mfaFilter,effectivePageSize,sort])
  useEffect(() => { if(tableRef.current) tableRef.current.scrollTop=0 },[currentPage,effectivePageSize])
  useEffect(() => {
    if (showInvite || isLoading || !filteredUsers.length || pageSize !== 0) return
    const container = tableRef.current
    const table = container?.querySelector('table')
    if (!container || !table) return
    let frame = 0
    function measureRows() {
      if (!container || !table) return
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'))
      if (!rows.length) return
      // Read natural row sizes before distributing spare space. Otherwise padded
      // rows would feed back into the next capacity calculation.
      rows.forEach(row => row.style.removeProperty('height'))
      const width = container.clientWidth
      const headerHeight = table.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const availableHeight = container.clientHeight - headerHeight
      if (availableHeight <= 0) return
      if (autoFitRowMeasurement.current.width !== width) {
        autoFitRowMeasurement.current = { width, height: 0 }
      }
      // Use a stable natural row height instead of recalculating from each page.
      // The owner has an extra label, so page-one measurements are retained.
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
      table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => row.style.removeProperty('height'))
    }
  }, [showInvite,isLoading,filteredUsers.length,pageSize,currentPage,effectivePageSize])

  useEffect(() => { if(showInvite) document.getElementById('user-email')?.focus() },[showInvite])
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('.sidebar__footer')
    const pageElement = invitePageRef.current
    if (!footer || !pageElement) return
    function alignFooter() {
      if (!footer || !pageElement) return
      const height = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
      pageElement.style.setProperty('--invitation-footer-height', height + 'px')
      const control = footer.querySelector<HTMLElement>('.sidebar__logout')
      if (control) {
        const controlRect = control.getBoundingClientRect()
        const center = controlRect.top + controlRect.height / 2
        const footerCenter = window.innerHeight - height / 2
        pageElement.style.setProperty('--invitation-footer-offset', (center - footerCenter) + 'px')
      }
    }
    alignFooter()
    const observer = new ResizeObserver(alignFooter)
    observer.observe(footer)
    window.addEventListener('resize', alignFooter)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', alignFooter)
      pageElement.style.removeProperty('--invitation-footer-height')
      pageElement.style.removeProperty('--invitation-footer-offset')
    }
  }, [showInvite])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!inviteOptions?.canInvite) return
    const sendNow = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') !== 'draft'
    const errors: Partial<Record<InviteField,string>> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'users.invalidWorkEmail'
    if (sendNow) {
      if (!fullName.trim()) errors.name = 'users.requiredFullName'

      if (!assignments.length) errors.company = 'users.requiredCompany'
    }
    setFieldErrors(errors)
    setError(null)
    const firstError = (Object.keys(errors) as InviteField[])[0]
    if (firstError) {
      const element = document.getElementById(INVITE_FIELD_IDS[firstError])
      element?.focus({ preventScroll: true })
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const payload: InvitationPayload = {
        departmentId, positionId,
        email: email.trim(),
        fullName: fullName.trim(),phone: phone.trim(),assignments: assignments.map(a => ({ ...a, organizationId: departmentId, positionId, roleIds: [] })),requireMfa,canInvite,
        settings: { expiryDays: 7,language,personalMessage,sendNow },
      }
      if (editingDraftId) await updateInvitation(editingDraftId, payload)
      else await createUser(payload)
      resetInviteForm()
      setShowInvite(false)
      setMessage(sendNow? t('users.mockInvitationRecorded'):t('users.draftSaved'))
      await loadUsers()
    } catch(err) {
      setError(err instanceof ApiError? err.message:t('users.errCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user: IdentityUser) {
    if (!canManageUserStatus || user.isOwner || statusUpdatingId || !['active','disabled'].includes(user.status)) return
    const nextStatus: UserStatus=user.status==='disabled'? 'active':'disabled'
    setError(null)
    setMessage(null)
    setStatusUpdatingId(user.id)
    try {
      const updated=await updateUser(user.id,{ status: nextStatus })
      setUsers((current) => current.map((item) => (item.id===updated.id? { ...item,...updated }:item)))
    } catch(err) {
      setError(err instanceof ApiError? err.message:t('users.errUpdate'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  function requestDelete(user: IdentityUser) {
    if(sessionUser?.id===user.id) {
      setError(t('users.deleteSelf'))
      return
    }
    setError(null)
    setPendingDelete(user)
  }

  async function handleConfirmDelete() {
    if(!pendingDelete) {
      return
    }
    setError(null)
    setMessage(null)
    setDeletingId(pendingDelete.id)
    try {
      await deleteUser(pendingDelete.id)
      setUsers((current) => current.filter((item) => item.id!==pendingDelete.id))
      setPendingDelete(null)
      setMessage(t('users.msgDeleted'))
    } catch(err) {
      setError(err instanceof ApiError? err.message:t('users.errDelete'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div ref={invitePageRef} className={`identity-page identity-users-page${showInvite ? ' identity-users-page--inviting' : ''}`}>
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <section className="identity-panel identity-directory-panel identity-directory-design" hidden={showInvite}>
        <div className="identity-directory-toolbar">
          <TextField
            className="identity-directory-toolbar__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('users.directorySearch')}
            aria-label={t('users.directorySearchAria')}
          />
          <div className="identity-directory-toolbar__filters">
            <SidebarSelect id="directory-company" className="directory-design-company-filter" label={t('users.filterCompany')} value={companyFilter}
              options={[{ value:'all',label:t('users.filterAll') },...companies.map(company => ({ value:company.id,label:company.name }))]} onChange={setCompanyFilter} />
            <SidebarSelect id="directory-status" label={t('users.filterStatus')} value={statusFilter}
              options={STATUS_FILTERS.map((value) => ({ value,label:statusLabel(value) }))} onChange={setStatusFilter} />
            <SidebarSelect id="directory-mfa" label={t('users.filterMfa')} value={mfaFilter}
              options={MFA_FILTERS.map((value) => ({ value,label:mfaLabel(value) }))} onChange={setMfaFilter} />
          </div>
          {inviteOptions?.canInvite? <Button className="identity-directory-invite-button" onClick={handleToggleInvite}>{t('users.inviteUser')}</Button>:null}
        </div>



        {isLoading? <p className="identity-empty">{t('users.loading')}</p>:null}
        {!isLoading&&users.length===0? <p className="identity-empty">{t('users.empty')}</p>:null}
        {!isLoading&&users.length>0&&filteredUsers.length===0? (
          <div className="identity-empty directory-design-empty"><p role="status">{t('users.emptyFiltered')}</p>{query||companyFilter!=='all'||statusFilter!=='all'||mfaFilter!=='all' ? <Button variant="secondary" onClick={()=>{setQuery('');setCompanyFilter('all');setStatusFilter('all');setMfaFilter('all')}}>{t('users.clearFilters')}</Button> : null}</div>
        ):null}
        {filteredUsers.length>0? (
          <div className="identity-table-wrap identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label={t('users.staffDirectory')}>
            <table className={`identity-table identity-table--packed directory-design-table${pageSize===0 ? ' directory-design-table--auto-fit' : ''}`}>
              <thead>
                <tr>
                  <th aria-sort={sort.key==='employee' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('employee',t('users.designEmployee'))}</th>
                  <th aria-sort={sort.key==='companies' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('companies',t('users.designCompanies'))}</th>
                  <th className="identity-table__status" aria-sort={sort.key==='status' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('status',t('users.colStatus'))}</th>
                  <th aria-sort={sort.key==='mfa' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('mfa',t('users.colMfa'))}</th>
                  <th aria-sort={sort.key==='created' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('created',t('users.createdAt'))}</th>
                  <th aria-sort={sort.key==='createdBy' ? sort.descending ? 'descending' : 'ascending' : 'none'}>{sortHeading('createdBy',t('users.createdBy'))}</th>
                  <th className="identity-table__actions">{t('users.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const assigned=memberships.filter(m => m.userId===user.id)
                  const companyNames=assigned.map(m => companies.find(c => c.id===m.companyId)?.name||'').filter(Boolean)
                  const positionNames=[...new Set(assigned.map(m => inviteOptions?.companies.find(c => c.id===m.companyId)?.departments.find(d => d.id===m.organizationId)?.positions.find(p => p.id===m.positionId)?.name).filter(Boolean))]
                  const canEdit=user.status==='draft' ? isOwner : canManageUsers||sessionUser?.id===user.id
                  return (
                  <tr key={user.id}>
                    <td>
                      <div className="directory-design-employee">
                        <span className="directory-design-avatar" aria-hidden="true">{user.displayName.trim().split(/\s+/).slice(0,2).map(name => name[0]).join('').toUpperCase()}</span>
                        <div className="directory-design-identity">
                          <Link className="identity-text-link" to={'/system/core/employees/'+user.id}>{user.displayName}</Link>
                          <span>{user.email}</span>
                        </div>
                        {sessionUser?.id===user.id ? <span className="directory-design-you">{t('users.designYou')}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="directory-design-companies"><span>{companyNames[0]||'—'}</span>
                        {companyNames.length>1 ? <Popover label={t('users.assignedCompanies')} trigger={<>+{companyNames.length-1}</>}>
                          <header className="directory-company-popover__header">
                            <h2>{t('users.assignedCompanies')}</h2>
                            <span>{companyNames.length}</span>
                          </header>
                          <ul className="directory-company-popover__list" tabIndex={0} aria-label={t('users.assignedCompanies')}>
                            {companyNames.map((name,index) => <li key={index}><IconBuilding aria-hidden="true" /><span>{name}</span></li>)}
                          </ul>
                        </Popover> : null}
                      </div>
                      {positionNames.length ? <span className="directory-design-position">{positionNames.join(', ')}</span> : null}
                    </td>
                    <td className="identity-table__status">
                      {canManageUserStatus && !user.isOwner && ['active','disabled'].includes(user.status) ? (
                        <button type="button" className={`identity-status identity-status--${user.status} identity-status--interactive`}
                          disabled={statusUpdatingId!==null} aria-busy={statusUpdatingId===user.id}
                          aria-label={t(user.status==='active'? 'users.deactivateUser':'users.activateUser', { name: user.displayName })}
                          title={t(user.status==='active'? 'users.deactivateUser':'users.activateUser', { name: user.displayName })}
                          onClick={() => void handleToggleStatus(user)}>
                          {formatStatusLabel(user.status,t)}
                        </button>
                      ) : <span className={`identity-status identity-status--${user.status}`}>{formatStatusLabel(user.status,t)}</span>}
                    </td>
                    <td><span className={'directory-design-mfa'+(user.mfaEnabled ? ' directory-design-mfa--enabled' : '')}>
                      {user.mfaEnabled ? <IconShieldCheck /> : <IconShieldOff />}
                      {user.signInMethod ? t(user.mfaEnabled ? 'users.mfaEnabled' : 'users.designMfaNotEnabled') : '—'}
                    </span></td>
                    <td className="directory-design-date">
                      <IconButton className="directory-design-created" variant="ghost"
                        label={new Date(user.createdAt).toLocaleTimeString(i18n.language,{ hour:'2-digit',minute:'2-digit',second:'2-digit' })}>
                        <IconClock aria-hidden="true" />
                        <time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleDateString(i18n.language,{ day:'numeric',month:'short',year:'numeric' })}</time>
                      </IconButton>
                    </td>
                    <td>
                      {user.createdBy ? <span className="directory-design-creator">
                        <span className="directory-design-creator__avatar" aria-hidden="true">{user.createdBy.trim().split(/\s+/).slice(0,2).map(name => name[0]).join('').toUpperCase()}</span>
                        <span>{user.createdBy}</span>
                      </span> : <span className="directory-design-date">—</span>}
                    </td>
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions identity-directory-actions">
                        <span style={{ visibility: canEdit ? 'visible' : 'hidden' }}>
                          <IconButton label={t(user.status==='draft' ? 'users.continueDraft' : 'users.actionEdit')}
                            onClick={() => user.status==='draft' ? openDraft(user) : navigate('/system/core/employees/'+user.id+'?edit=1')}>
                            <IconPencil />
                          </IconButton>
                        </span>
                        <IconButton label={t('users.actionView')} onClick={() => navigate('/system/core/employees/'+user.id)}>
                          <IconEye />
                        </IconButton>
                        {isOwner ? <IconButton label={t(sessionUser?.id===user.id ? 'users.deleteSelf' : 'users.actionDelete')}
                          variant="danger" disabled={deletingId===user.id||sessionUser?.id===user.id} onClick={() => requestDelete(user)}>
                          <IconTrash />
                        </IconButton> : null}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ):null}
        <footer className="identity-directory-footer">
          <div className="identity-directory-footer__listing">
            <label htmlFor="directory-page-size">{t('users.rowsPerPage')}</label>
            <SidebarSelect id="directory-page-size" hideLabel className="identity-pagination-select" label={t('users.rowsPerPage')} title={pageSize===0? t('users.autoRowsHint', { count: autoPageSize }):undefined} value={String(pageSize)} options={[{ value: '0', label: '–' }, ...[10,25,50,100,200].map(n => ({ value: String(n), label: String(n) }))]} onChange={value => setPageSize(Number(value))} />
            <span>{t('users.listingRange', { start: filteredUsers.length ? (currentPage-1)*effectivePageSize+1 : 0, end: Math.min(currentPage*effectivePageSize,filteredUsers.length), total: filteredUsers.length })}</span>
          </div>
          <nav className="identity-pagination" aria-label={t('users.directoryPages')}>
            <Button variant="secondary" disabled={currentPage===1} onClick={() => setPage(currentPage-1)} aria-label={t('users.previousPage')}>‹</Button>
            {paginationItems(currentPage,pageCount).map(item => {
              if (typeof item === 'number') return (
                <Button key={item} variant="secondary" aria-label={t('users.pageNumber', { page: item })} aria-current={item===currentPage? 'page':undefined} onClick={() => setPage(item)}>{item}</Button>
              )
              const backward = item === 'backward'
              const label = t(backward ? 'users.jumpBackPages' : 'users.jumpForwardPages')
              return <Button key={item} variant="ghost" className="identity-pagination__jump" aria-label={label} title={label} onClick={() => setPage(Math.max(1,Math.min(pageCount,currentPage + (backward ? -5 : 5))))}>
                <span className="identity-pagination__ellipsis" aria-hidden>•••</span>
                <span className="identity-pagination__jump-arrow" aria-hidden>{backward ? '«' : '»'}</span>
              </Button>
            })}
            <Button variant="secondary" disabled={currentPage===pageCount} onClick={() => setPage(currentPage+1)} aria-label={t('users.nextPage')}>›</Button>
          </nav>
        </footer>
      </section>


      {showInvite? <form noValidate className="identity-invite identity-invite--page" onSubmit={e => void handleCreate(e)}>
        <div className="identity-invite-content">

        <fieldset disabled={isSubmitting} className="identity-invite-sections">
          <section className="identity-panel">
            <h3>{t('users.basicInformation')}</h3>
            <div className="identity-invite-fields">
              <FormField label={t('users.workEmail')} htmlFor="user-email" error={fieldErrors.email ? t(fieldErrors.email) : undefined}>
                <TextField id="user-email" type="email" required value={email} hasError={Boolean(fieldErrors.email)} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'user-email-error' : undefined} onChange={e => { setEmail(e.target.value); clearFieldError('email') }} autoComplete="email" />
              </FormField>
              <FormField label={t('users.fieldFullName')} htmlFor="user-name" error={fieldErrors.name ? t(fieldErrors.name) : undefined}>
                <TextField id="user-name" required value={fullName} hasError={Boolean(fieldErrors.name)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'user-name-error' : undefined} onChange={e => { setFullName(e.target.value); clearFieldError('name') }} autoComplete="name" />
              </FormField>
              <FormField label={t('users.optionalPhone')} htmlFor="user-phone">
                <TextField id="user-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
              </FormField>
              <FormField label={t('users.optionalDepartment')} htmlFor="user-department" error={fieldErrors.department ? t(fieldErrors.department) : undefined}>
              <SidebarSelect id="user-department" hideLabel aria-invalid={Boolean(fieldErrors.department)} aria-describedby={fieldErrors.department ? 'user-department-error' : undefined} label={t('users.department')} value={departmentId} options={[{ value: '', label: t('users.selectDepartment') }, ...(inviteOptions?.departments.map(d => ({ value: d.id, label: d.name })) || [])]} onChange={id => {
                clearFieldError('department')
                clearFieldError('position')
                setDepartmentId(id)
                const positions = inviteOptions?.departments.find(department => department.id === id)?.positions || []
                setPositionId(positions.length === 1 ? positions[0]!.id : '')
              }} disabled={isSubmitting} />
              </FormField>
              <FormField label={t('users.optionalPosition')} htmlFor="user-position" error={fieldErrors.position ? t(fieldErrors.position) : undefined}>
              <SidebarSelect id="user-position" hideLabel aria-invalid={Boolean(fieldErrors.position)} aria-describedby={fieldErrors.position ? 'user-position-error' : undefined} label={t('users.colPosition')} value={positionId} options={[{ value: '', label: t('users.selectPosition') }, ...(department?.positions.map(p => ({ value: p.id, label: p.name })) || [])]} onChange={id => { setPositionId(id); clearFieldError('position') }} disabled={!department || isSubmitting} />
              </FormField>

            </div>
            <label className="identity-invite-switch">
              <input type="checkbox" role="switch" checked={requireMfa||mfaRequiredByPolicy} disabled={mfaRequiredByPolicy} onChange={e => setRequireMfa(e.target.checked)} />{t('users.actionRequireMfa')}</label>{mfaRequiredByPolicy? <p className="identity-directory-muted">{t('users.companyPolicyMfa')}</p>:null}<p className="identity-directory-muted">{t('users.mfaEnrollmentHint')}</p>
          </section>
          <section className="identity-panel">
            <h3>{t('users.companySelection')}</h3>
            <p className="identity-directory-muted">{t('users.companySelectionHint')}</p>
            <div className="identity-company-buttons">{inviteOptions?.companies.map(company => {
              const selected = assignments.some(a => a.companyId === company.id)
              return <Button id={company.id === inviteOptions.companies[0]?.id ? 'user-company' : undefined} aria-invalid={Boolean(fieldErrors.company)} aria-describedby={fieldErrors.company ? 'user-company-error' : undefined} key={company.id} variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => { clearFieldError('company'); setAssignments(current => selected ? current.filter(a => a.companyId !== company.id) : [...current, { companyId: company.id, organizationId: '', positionId: '', roleIds: [] }]) }}>
                <span>{company.name}</span>
              </Button>
            })}</div>
            {fieldErrors.company ? <p id="user-company-error" className="ui-form-field__error" role="alert">{t(fieldErrors.company)}</p> : null}
            <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={canInvite} onChange={e => setCanInvite(e.target.checked)} />{t('users.canInvite')}</label>
          </section>
          <section className="identity-panel identity-invite-section--wide">
            <div className="identity-delivery-heading">
              <div><h3>{t('users.invitationSettings')}</h3><p className="identity-directory-muted">{t('users.expiryPrefix')} <strong>{t('users.expiryDuration')}</strong>.</p></div>
              <div className="identity-language-toggle" data-language={language} role="group" aria-label={t('users.emailLanguage')}>
                {[{ value: 'en', label: 'English' }, { value: 'zh-CN', label: '中文' }].map(option => <button key={option.value} type="button" aria-pressed={language === option.value} disabled={isSubmitting} onClick={() => { setLanguage(option.value); if (language !== option.value) setPersonalMessage(invitationMessage(option.value)) }}>{option.label}</button>)}
              </div>
            </div>
            <FormField label={t('users.personalMessage')} htmlFor="user-message">
              <textarea id="user-message" value={personalMessage} onChange={e => setPersonalMessage(e.target.value)} maxLength={1000} />
            </FormField>
            <div className="identity-delivery-actions">
              <Button type="button" variant="ghost" onClick={() => setPersonalMessage(invitationMessage(language))}>{t('users.restoreMessage')}</Button>
              <Button type="submit" name="invitation-action" value="draft" formNoValidate variant="secondary" disabled={isSubmitting || !inviteOptions?.canInvite}>{t('users.saveDraft')}</Button>
            </div>
          </section>
        </fieldset>
        </div>
        <footer className="identity-invite-page-footer">
          <Button variant="secondary" onClick={handleToggleInvite} disabled={isSubmitting}>{t('users.cancel')}</Button>
          <Button type="submit" name="invitation-action" value="send" disabled={isSubmitting||!inviteOptions?.canInvite}>{isSubmitting ? t('users.saving') : t('users.sendInvitation')}</Button>
        </footer>
      </form>:null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('users.deleteTitle')}
        description={
          pendingDelete? (
            <>
              {t('users.deleteDescriptionPrefix')}{' '}
              <strong>
                {pendingDelete.displayName} ({pendingDelete.email})
              </strong>{' '}
              {t('users.deleteDescriptionSuffix')}
            </>
          ):null
        }
        confirmLabel={t('users.deleteConfirm')}
        busy={Boolean(deletingId)}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if(!deletingId) {
            setPendingDelete(null)
          }
        }}
      />
    </div>
  )
}
