import { useCallback,useEffect,useMemo,useRef,useState,type FormEvent } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import {
  IconBan,
  IconCircleCheck,
  IconEye,
  IconPencil,
  IconShield,
  IconShieldOff,
  IconTrash,
} from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import type { CompanyListItem } from '@/modules/core/identity/services/identityService'
import type { IdentityUser,SignInMethod,UserStatus,InvitationOptions,InvitationAssignment,InvitationPayload } from '@/modules/core/identity/types/identity'
import {
  formatDirectoryMfa,
  formatSignInMethod,
  formatStatusLabel,
  isIdentityProfileComplete,
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
import './IdentityPage.css'

const INVITATION_MESSAGES: Record<string, string> = {
  en: 'Welcome to AIOS! You’re invited to join our team. Please accept this invitation to activate your account and access your assigned companies.',
  'zh-CN': '欢迎加入 AIOS！诚邀您加入我们的团队。请接受邀请以激活您的账户，并访问为您分配的公司。',
}

type InviteField = 'email' | 'name' | 'department' | 'position' | 'company'
const INVITE_FIELD_IDS: Record<InviteField, string> = { email: 'user-email', name: 'user-name', department: 'user-department', position: 'user-position', company: 'user-company' }

const STATUS_FILTERS=['all','active','invited','draft','disabled'] as const

const MFA_FILTERS=['all','enabled','disabled'] as const

const SIGN_IN_FILTERS=['all','otp','password','google','facebook','apple','none'] as const

function matchesSearch(user: IdentityUser,query: string) {
  if(!query) {
    return true
  }
  const haystack=`${user.displayName} ${user.fullName} ${user.email} ${user.phone}`.toLowerCase()
  return haystack.includes(query)
}

export function UsersPage() {
  const { t }=useTranslation()
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
  const signInLabel=(value: string) =>
    value==='all'
      ? t('users.filterAll')
      :value==='none'
        ? t('users.methodNone')
        :formatSignInMethod(value as SignInMethod,t)
  const sessionUser=useAuthStore((state) => state.user)
  const [users,setUsers]=useState<IdentityUser[]>([])
  const [companies,setCompanies]=useState<CompanyListItem[]>([])
  const [email,setEmail]=useState('')
  const [fullName,setFullName]=useState('')
  const [phone,setPhone]=useState('')
  const [requireMfa,setRequireMfa]=useState(false)
  const [canInvite,setCanInvite]=useState(false)
  const [language,setLanguage]=useState('en')
  const [personalMessage,setPersonalMessage]=useState(INVITATION_MESSAGES.en)
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [assignments,setAssignments]=useState<InvitationAssignment[]>([])
  const [inviteOptions,setInviteOptions]=useState<InvitationOptions|null>(null)
  const [memberships,setMemberships]=useState<Awaited<ReturnType<typeof fetchMemberships>>['items']>([])
  const [pageSize,setPageSize]=useState(50)
  const [page,setPage]=useState(1)
  const department = inviteOptions?.departments.find(d => d.id === departmentId)
  const tableRef=useRef<HTMLDivElement>(null)
  const mfaRequiredByPolicy=assignments.some(a => inviteOptions?.companies.find(c => c.id===a.companyId)?.requireMfa)
  const isOwner=users.some(u => u.id===sessionUser?.id&&u.isOwner)
  const [query,setQuery]=useState('')
  const [statusFilter,setStatusFilter]=useState('all')
  const [signInFilter,setSignInFilter]=useState('all')
  const [mfaFilter,setMfaFilter]=useState('all')
  const [showInvite,setShowInvite]=useState(false)
  const [fieldErrors,setFieldErrors]=useState<Partial<Record<InviteField,string>>>({})
  const [editingDraftId,setEditingDraftId]=useState<string|null>(null)
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

  const filteredUsers=useMemo(() => {
    const normalizedQuery=query.trim().toLowerCase()
    return users.filter((user) => {
      if(user.isOwner&&user.id!==sessionUser?.id) return false
      if(!matchesSearch(user,normalizedQuery)) {
        return false
      }
      if(statusFilter!=='all'&&user.status!==statusFilter) {
        return false
      }
      if(signInFilter==='none'&&user.signInMethod) {
        return false
      }
      if(signInFilter!=='all'&&signInFilter!=='none'&&user.signInMethod!==signInFilter) {
        return false
      }
      if(mfaFilter==='enabled'&&(!user.signInMethod||!user.mfaEnabled)) {
        return false
      }
      if(mfaFilter==='disabled'&&(!user.signInMethod||user.mfaEnabled)) {
        return false
      }
      return true
    })
  },[users,query,statusFilter,signInFilter,mfaFilter,sessionUser?.id])

  function clearFieldError(field: InviteField) {
    setFieldErrors(current => ({ ...current, [field]: undefined }))
  }

  function resetInviteForm() {
    setFieldErrors({})
    setEditingDraftId(null)
    setEmail('')
    setFullName(''); setPhone(''); setRequireMfa(false); setCanInvite(false)
    setDepartmentId(''); setPositionId(''); setAssignments([]); setLanguage('en'); setPersonalMessage(INVITATION_MESSAGES.en)
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
    setPersonalMessage(settings?.personalMessage ?? INVITATION_MESSAGES.en)
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

  const pageCount=Math.max(1,Math.ceil(filteredUsers.length/pageSize))
  const currentPage=Math.min(page,pageCount)
  const visibleUsers=filteredUsers.slice((currentPage-1)*pageSize,currentPage*pageSize)
  useEffect(() => { setPage(1) },[query,statusFilter,signInFilter,mfaFilter,pageSize])
  useEffect(() => { if(tableRef.current) tableRef.current.scrollTop=0 },[currentPage,pageSize])
  useEffect(() => { if(showInvite) document.getElementById('user-email')?.focus() },[showInvite])
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!inviteOptions?.canInvite||!isOwner) return
    const sendNow = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') !== 'draft'
    const errors: Partial<Record<InviteField,string>> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid work email.'
    if (sendNow) {
      if (!fullName.trim()) errors.name = 'Enter the full name.'
      if (!departmentId) errors.department = 'Select a department.'
      if (departmentId && !positionId) errors.position = 'Select a position.'
      if (!assignments.length) errors.company = 'Select at least one company.'
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
      setMessage(sendNow? 'Invitation recorded. Email delivery is not connected in the mock API.':'Invitation draft saved.')
      await loadUsers()
    } catch(err) {
      setError(err instanceof ApiError? err.message:t('users.errCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user: IdentityUser) {
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
    <div className={`identity-page identity-users-page${showInvite ? ' identity-users-page--inviting' : ''}`}>
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <section className="identity-panel" hidden={showInvite}>
        <div className="identity-directory-toolbar">
          <TextField
            className="identity-directory-toolbar__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or phone…"
            aria-label="Search staff by name, email or phone"
          />
          <div className="identity-directory-toolbar__filters">
            <SidebarSelect
              id="directory-status"
              label={t('users.filterStatus')}
              value={statusFilter}
              options={STATUS_FILTERS.map((value) => ({ value,label: statusLabel(value) }))}
              onChange={setStatusFilter}
            />
            <SidebarSelect
              id="directory-signin"
              label={t('users.filterSignInMethod')}
              value={signInFilter}
              options={SIGN_IN_FILTERS.map((value) => ({ value,label: signInLabel(value) }))}
              onChange={setSignInFilter}
            />
            <SidebarSelect
              id="directory-mfa"
              label={t('users.filterMfa')}
              value={mfaFilter}
              options={MFA_FILTERS.map((value) => ({ value,label: mfaLabel(value) }))}
              onChange={setMfaFilter}
            />
          </div>
          {isOwner&&inviteOptions?.canInvite? <Button className="identity-directory-invite-button" onClick={handleToggleInvite}>{t('users.inviteUser')}</Button>:null}
        </div>

        {isLoading? <p className="identity-empty">{t('users.loading')}</p>:null}
        {!isLoading&&users.length===0? <p className="identity-empty">{t('users.empty')}</p>:null}
        {!isLoading&&users.length>0&&filteredUsers.length===0? (
          <p className="identity-empty">{t('users.emptyFiltered')}</p>
        ):null}
        {filteredUsers.length>0? (
          <div className="identity-table-wrap identity-directory-scroll" ref={tableRef} tabIndex={0} aria-label="Staff directory">
            <table className="identity-table identity-table--packed">
              <thead>
                <tr>
                  <th>{t('users.colName')}</th>
                  <th>{t('users.colEmail')}</th>
                  <th className="identity-table__status">{t('users.colStatus')}</th>
                  <th>Phone</th>
                  <th>Position</th>
                  <th>{t('users.colMfa')}</th>
                  <th>Created at</th>
                  <th className="identity-table__spacer" aria-hidden="true" />
                  <th className="identity-table__actions">{t('users.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link className="identity-text-link" to={`/system/core/employees/${user.id}`}>
                        {user.fullName||user.displayName}
                      </Link>
                      {user.isOwner? <span className="identity-directory-muted">Owner · You</span>:null}
                      {!isIdentityProfileComplete(user)? (
                        <span className="identity-status identity-status--invited identity-status--inline">
                          Incomplete
                        </span>
                      ):null}
                    </td>
                    <td>{user.email}</td>
                    <td className="identity-table__status">
                      <span className={`identity-status identity-status--${user.status}`}>
                        {formatStatusLabel(user.status,t)}
                      </span>
                    </td>
                    <td>{user.phone||'—'}</td>
                    <td>{memberships.filter(m => m.userId===user.id).map(m => companies.find(c => c.id===m.companyId)?.name||'').filter(Boolean).join(', ')||'—'}<span className="identity-directory-muted">{memberships.filter(m => m.userId===user.id).map(m => inviteOptions?.companies.find(c => c.id===m.companyId)?.departments.find(d => d.id===m.organizationId)?.positions.find(p => p.id===m.positionId)?.name).filter(Boolean).join(', ')||'—'}</span>
                    </td>
                    <td>{formatDirectoryMfa(user,t)}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="identity-table__spacer" aria-hidden="true" />
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions">
                        <IconButton
                          label={t('users.actionView')}
                          onClick={() => navigate(`/system/core/employees/${user.id}`)}
                        >
                          <IconEye />
                        </IconButton>
                        <IconButton
                          label={user.status==='draft'? 'Continue editing draft':t('users.actionEdit')}
                          disabled={!isOwner && sessionUser?.id !== user.id}
                          onClick={() => user.status==='draft'? openDraft(user):navigate(`/system/core/employees/${user.id}?edit=1`)}
                        >
                          <IconPencil />
                        </IconButton>
                        {isOwner&&user.signInMethod? (
                          <IconButton
                            label={user.mfaEnabled? t('users.actionResetMfa'):t('users.actionRequireMfa')}
                            onClick={() =>
                              navigate(
                                `/mfa/setup?userId=${user.id}&mode=${user.mfaEnabled? 'reset':'require'}`,
                              )
                            }
                          >
                            {user.mfaEnabled? <IconShieldOff />:<IconShield />}
                          </IconButton>
                        ):null}
                        <IconButton
                          label={user.status==='active'? t('users.statusActive'):t('users.statusInactive')}
                          variant={user.status==='active'? 'secondary':'danger'}
                          onClick={() => void handleToggleStatus(user)}
                          disabled={!isOwner||user.isOwner||user.status==='invited'||user.status==='draft'||statusUpdatingId===user.id}
                        >
                          {user.status==='active'? <IconCircleCheck />:<IconBan />}
                        </IconButton>
                        <IconButton
                          label={sessionUser?.id===user.id? t('users.deleteSelf'):t('users.actionDelete')}
                          variant="danger"
                          onClick={() => requestDelete(user)}
                          disabled={!isOwner||deletingId===user.id||sessionUser?.id===user.id}
                        >
                          <IconTrash />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ):null}
        <footer className="identity-directory-footer">
          <label>Rows per page <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[25,50,100,200].map(n =>
            <option key={n}>{n}</option>)}</select>
            <span>{filteredUsers.length? (currentPage-1)*pageSize+1:0}–{Math.min(currentPage*pageSize,filteredUsers.length)} of {filteredUsers.length}</span>
          </label>
          <nav aria-label="Staff directory pages">
            <Button variant="secondary" disabled={currentPage===1} onClick={() => setPage(currentPage-1)} aria-label="Previous page">‹</Button>{[...new Set([1,currentPage-1,currentPage,currentPage+1,pageCount])].filter(n => n>0&&n<=pageCount).sort((a,b) => a-b).map(n =>
              <Button key={n} variant={n===currentPage? 'primary':'secondary'} aria-current={n===currentPage? 'page':undefined} onClick={() => setPage(n)}>{n}</Button>)}<select aria-label="Select page" value={currentPage} onChange={e => setPage(Number(e.target.value))}>{Array.from({ length: pageCount },(_,i) =>
                <option key={i} value={i+1}>Page {i+1}</option>)}</select>
            <Button variant="secondary" disabled={currentPage===pageCount} onClick={() => setPage(currentPage+1)} aria-label="Next page">›</Button>
          </nav>
        </footer>
      </section>


      {showInvite? <form noValidate className="identity-invite identity-invite--page" onSubmit={e => void handleCreate(e)}>
        <div className="identity-invite-content">
        <header className="identity-panel__title-row">
          <div>
            <h2>{editingDraftId? 'Edit invitation draft':'Invite user'}</h2>
            <p>Set up their profile, company assignments and access.</p>
          </div>
          <Button variant="secondary" onClick={handleToggleInvite} disabled={isSubmitting}>Back to users</Button>
        </header>
        <fieldset disabled={isSubmitting} className="identity-invite-sections">
          <section className="identity-panel">
            <span className="identity-directory-muted">01 / PROFILE & SECURITY</span>
            <h3>Basic information</h3>
            <div className="identity-invite-fields">
              <FormField label="Work email" htmlFor="user-email" error={fieldErrors.email}>
                <TextField id="user-email" type="email" required value={email} hasError={Boolean(fieldErrors.email)} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'user-email-error' : undefined} onChange={e => { setEmail(e.target.value); clearFieldError('email') }} autoComplete="email" />
              </FormField>
              <FormField label="Full name" htmlFor="user-name" error={fieldErrors.name}>
                <TextField id="user-name" required value={fullName} hasError={Boolean(fieldErrors.name)} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'user-name-error' : undefined} onChange={e => { setFullName(e.target.value); clearFieldError('name') }} autoComplete="name" />
              </FormField>
              <FormField label="Phone number (optional)" htmlFor="user-phone">
                <TextField id="user-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
              </FormField>
              <FormField label="Department" htmlFor="user-department" error={fieldErrors.department}>
              <SidebarSelect id="user-department" hideLabel aria-invalid={Boolean(fieldErrors.department)} aria-describedby={fieldErrors.department ? 'user-department-error' : undefined} label="Department" value={departmentId} options={[{ value: '', label: 'Select department' }, ...(inviteOptions?.departments.map(d => ({ value: d.id, label: d.name })) || [])]} onChange={id => {
                clearFieldError('department')
                clearFieldError('position')
                setDepartmentId(id)
                const positions = inviteOptions?.departments.find(department => department.id === id)?.positions || []
                setPositionId(positions.length === 1 ? positions[0]!.id : '')
              }} disabled={isSubmitting} />
              </FormField>
              <FormField label="Position" htmlFor="user-position" error={fieldErrors.position}>
              <SidebarSelect id="user-position" hideLabel aria-invalid={Boolean(fieldErrors.position)} aria-describedby={fieldErrors.position ? 'user-position-error' : undefined} label="Position" value={positionId} options={[{ value: '', label: 'Select position' }, ...(department?.positions.map(p => ({ value: p.id, label: p.name })) || [])]} onChange={id => { setPositionId(id); clearFieldError('position') }} disabled={!department || isSubmitting} />
              </FormField>

            </div>
            <label className="identity-invite-switch">
              <input type="checkbox" role="switch" checked={requireMfa||mfaRequiredByPolicy} disabled={mfaRequiredByPolicy} onChange={e => setRequireMfa(e.target.checked)} />Require MFA</label>{mfaRequiredByPolicy? <p className="identity-directory-muted">Required by company policy</p>:null}<p className="identity-directory-muted">Staff enroll their own authenticator before activation. Password setup is not required.</p>
          </section>
          <section className="identity-panel">
            <span className="identity-directory-muted">02 / COMPANY & TEAM</span>
            <h3>Company selection</h3>
            <p className="identity-directory-muted">Select one or more companies. The department and position above apply to all selected companies.</p>
            <div className="identity-company-buttons">{inviteOptions?.companies.map(company => {
              const selected = assignments.some(a => a.companyId === company.id)
              return <Button id={company.id === inviteOptions.companies[0]?.id ? 'user-company' : undefined} aria-invalid={Boolean(fieldErrors.company)} aria-describedby={fieldErrors.company ? 'user-company-error' : undefined} key={company.id} variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => { clearFieldError('company'); setAssignments(current => selected ? current.filter(a => a.companyId !== company.id) : [...current, { companyId: company.id, organizationId: '', positionId: '', roleIds: [] }]) }}>
                <span>{company.name}</span>
              </Button>
            })}</div>
            {fieldErrors.company ? <p id="user-company-error" className="ui-form-field__error" role="alert">{fieldErrors.company}</p> : null}
            <label className="identity-invite-check"><input type="checkbox" checked={canInvite} onChange={e => setCanInvite(e.target.checked)} />Can invite users</label>
          </section>
          <section className="identity-panel identity-invite-section--wide">
            <div className="identity-delivery-heading">
              <div><span className="identity-directory-muted">03 / DELIVERY</span><h3>Invitation settings</h3><p className="identity-directory-muted">Invitation expires <strong>7 days after sending</strong>.</p></div>
              <div className="identity-language-toggle" role="group" aria-label="Email language">
                {[{ value: 'en', label: 'English' }, { value: 'zh-CN', label: '中文' }].map(option => <button key={option.value} type="button" aria-pressed={language === option.value} disabled={isSubmitting} onClick={() => { setLanguage(option.value); if (language !== option.value) setPersonalMessage(INVITATION_MESSAGES[option.value]) }}>{option.label}</button>)}
              </div>
            </div>
            <FormField label="Personal message (optional)" htmlFor="user-message">
              <textarea id="user-message" value={personalMessage} onChange={e => setPersonalMessage(e.target.value)} maxLength={1000} />
            </FormField>
            <div className="identity-delivery-actions">
              <Button type="button" variant="ghost" onClick={() => setPersonalMessage(INVITATION_MESSAGES[language])}>Restore default message</Button>
              <Button type="submit" name="invitation-action" value="draft" formNoValidate variant="secondary" disabled={isSubmitting || !inviteOptions?.canInvite}>Save draft</Button>
            </div>
          </section>
        </fieldset>
        </div>
        <footer className="identity-invite-page-footer">
          <Button variant="secondary" onClick={handleToggleInvite} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" name="invitation-action" value="send" disabled={isSubmitting||!inviteOptions?.canInvite}>{isSubmitting ? t('users.saving') : 'Send invitation'}</Button>
        </footer>
      </form>:null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('users.deleteTitle')}
        description={
          pendingDelete? (
            <>
              This will permanently remove{' '}
              <strong>
                {pendingDelete.displayName} ({pendingDelete.email})
              </strong>{' '}
              and their memberships.
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
