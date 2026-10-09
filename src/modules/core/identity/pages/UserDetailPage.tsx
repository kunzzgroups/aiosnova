import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { AppShellHeaderContext } from '@/layouts/AppShell'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { isIdentityProfileComplete, type IdentityUser, type InvitationOptions } from '@/modules/core/identity/types/identity'
import { fetchUser, fetchUsers, fetchInvitationOptions, updateUser, type MembershipWithLabels } from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function UserDetailPage() {
  const { t } = useTranslation()
  const { userId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setShellHeader = useContext(AppShellHeaderContext)
  const sessionUser = useAuthStore(state => state.user)
  const pageRef = useRef<HTMLDivElement>(null)
  const [user,setUser] = useState<IdentityUser|null>(null)
  const [memberships,setMemberships] = useState<MembershipWithLabels[]>([])
  const [options,setOptions] = useState<InvitationOptions|null>(null)
  const [isOwner,setIsOwner] = useState(false)
  const [isAdmin,setIsAdmin] = useState(false)
  const [isEditing,setIsEditing] = useState(searchParams.get('edit') === '1')
  const [email,setEmail] = useState('')
  const [fullName,setFullName] = useState('')
  const [phone,setPhone] = useState('')
  const [departmentId,setDepartmentId] = useState('')
  const [positionId,setPositionId] = useState('')
  const [companyIds,setCompanyIds] = useState<string[]>([])
  const [requireMfa,setRequireMfa] = useState(false)
  const [canInvite,setCanInvite] = useState(false)
  const [error,setError] = useState<string|null>(null)
  const [message,setMessage] = useState<string|null>(null)
  const [isLoading,setIsLoading] = useState(true)
  const [isSaving,setIsSaving] = useState(false)
  const canManage = isOwner || isAdmin
  const canEdit = canManage || sessionUser?.id === userId
  const department = options?.departments.find(item => item.id === departmentId)
  const policyMfa = companyIds.some(id => options?.companies.find(company => company.id === id)?.requireMfa)

  function applyProfileForm(nextUser: IdentityUser, assignments: MembershipWithLabels[]) {
    setEmail(nextUser.email)
    setFullName(nextUser.fullName || nextUser.displayName)
    setPhone(nextUser.phone)
    setDepartmentId(nextUser.departmentId ?? assignments[0]?.organizationId ?? '')
    setPositionId(nextUser.positionId ?? assignments[0]?.positionId ?? '')
    setCompanyIds(assignments.map(item => item.companyId).filter((id): id is string => Boolean(id)))
    setRequireMfa(Boolean(nextUser.requireMfa))
    setCanInvite(Boolean(nextUser.canInvite))
  }

  const loadUser = useCallback(async () => {
    setIsLoading(true)
    try {
      const [result,invitationOptions,directory] = await Promise.all([fetchUser(userId),fetchInvitationOptions(),fetchUsers()])
      setUser(result.user)
      setMemberships(result.memberships)
      setOptions(invitationOptions)
      setIsOwner(directory.items.some(item => item.id === sessionUser?.id && item.isOwner))
      setIsAdmin(directory.items.some(item => item.id === sessionUser?.id && item.canManageUsers))
      applyProfileForm(result.user,result.memberships)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errLoadUser'))
      setUser(null)
    } finally { setIsLoading(false) }
  },[userId,sessionUser?.id])
  useEffect(() => { void loadUser() },[loadUser])
  useEffect(() => {
    setShellHeader({ titleKey: isEditing ? 'users.editUserTitle' : 'users.viewUserTitle', descriptionKey: 'users.profileDescription' })
    return () => setShellHeader(null)
  },[isEditing,setShellHeader])
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('.sidebar__footer')
    const page = pageRef.current
    if (!footer || !page) return
    const align = () => {
      const height = window.innerHeight - footer.getBoundingClientRect().top
      page.style.setProperty('--invitation-footer-height',height + 'px')
      const control = footer.querySelector<HTMLElement>('.sidebar__logout')?.getBoundingClientRect()
      if (control) page.style.setProperty('--invitation-footer-offset',(control.top + control.height / 2 - (window.innerHeight - height / 2)) + 'px')
    }
    const observer = new ResizeObserver(align)
    observer.observe(footer)
    window.addEventListener('resize',align)
    align()
    return () => { observer.disconnect(); window.removeEventListener('resize',align) }
  },[])

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canEdit || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const updated = await updateUser(user.id,{
        email: email.trim(), fullName: fullName.trim(), displayName: fullName.trim(), phone: phone.trim(),
        ...(canManage ? { requireMfa, canInvite } : {}),
        ...(canManage ? { departmentId, positionId,
          assignments: companyIds.map(companyId => {
            const existing = memberships.find(item => item.companyId === companyId)
            const teamChanged = departmentId !== (user.departmentId ?? memberships[0]?.organizationId ?? '') || positionId !== (user.positionId ?? memberships[0]?.positionId ?? '')
            return { companyId, organizationId: existing && !teamChanged ? (existing.organizationId ?? '') : departmentId, positionId: existing && !teamChanged ? (existing.positionId ?? '') : positionId, roleIds: existing?.roleIds ?? [] }
          }) } : {}),
      })
      const result = await fetchUser(user.id)
      setUser(updated)
      setMemberships(result.memberships)
      applyProfileForm(updated,result.memberships)
      if (sessionUser?.id === updated.id) useAuthStore.getState().setUser({ ...sessionUser,email: updated.email,name: updated.displayName,mfaEnabled: updated.mfaEnabled,profileComplete: isIdentityProfileComplete(updated),isOwner: updated.isOwner,canManageUsers: updated.canManageUsers })
      setIsEditing(false)
      setMessage(t('users.msgProfileSaved'))
    } catch (err) { setError(err instanceof ApiError ? err.message : t('users.errSaveProfile')) }
    finally { setIsSaving(false) }
  }

  return <div ref={pageRef} className="identity-page identity-users-page identity-users-page--inviting">
    <FlashToasts error={error} message={message} onClearError={() => setError(null)} onClearMessage={() => setMessage(null)} />
    {isLoading ? <p className="identity-empty">{t('users.loading')}</p> : !user ? <Button variant="secondary" onClick={() => navigate('/system/core/employees')}>{t('users.backToUsers')}</Button> :
    <form className="identity-invite identity-invite--page" onSubmit={event => void handleSaveProfile(event)}>
      <div className="identity-invite-content">
        <fieldset className="identity-invite-sections" disabled={!isEditing || !canEdit || isSaving}>
          <section className="identity-panel">
            <h3>{t('users.basicInformation')}</h3>
            <div className="identity-invite-fields">
              <FormField label={t('users.workEmail')} htmlFor="profile-email"><TextField id="profile-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></FormField>
              <FormField label={t('users.fieldFullName')} htmlFor="profile-name"><TextField id="profile-name" required value={fullName} onChange={event => setFullName(event.target.value)} /></FormField>
              <FormField label={t('users.optionalPhone')} htmlFor="profile-phone"><TextField id="profile-phone" type="tel" value={phone && !canEdit ? '••••••••' : phone} onChange={event => setPhone(event.target.value)} /></FormField>
              <FormField label={t('users.optionalDepartment')} htmlFor="profile-department"><SidebarSelect id="profile-department" hideLabel label={t('users.department')} value={departmentId} disabled={!canManage} options={[{value:'',label:t('users.selectDepartment')},...(options?.departments.map(item => ({value:item.id,label:item.name})) ?? [])]} onChange={id => {setDepartmentId(id); const positions = options?.departments.find(item => item.id === id)?.positions ?? []; setPositionId(positions.length === 1 ? positions[0]!.id : '')}} /></FormField>
              <FormField label={t('users.optionalPosition')} htmlFor="profile-position"><SidebarSelect id="profile-position" hideLabel label={t('users.colPosition')} value={positionId} disabled={!canManage || !department} options={[{value:'',label:t('users.selectPosition')},...(department?.positions.map(item => ({value:item.id,label:item.name})) ?? [])]} onChange={setPositionId} /></FormField>
            </div>
            {canManage ? <>
              <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={requireMfa || policyMfa} disabled={policyMfa} onChange={event => setRequireMfa(event.target.checked)} />{t('users.actionRequireMfa')}</label>
              {policyMfa ? <p className="identity-directory-muted">{t('users.companyPolicyMfa')}</p> : null}
              <p className="identity-directory-muted">{t('users.profileMfaHint')}</p>
            </> : null}
          </section>
          <section className="identity-panel">
            <h3>{t('users.companySelection')}</h3>
            <p className="identity-directory-muted">{t('users.companySelectionHint')}</p>
            <div className="identity-company-buttons">{options?.companies.map(company => {
              const selected = companyIds.includes(company.id)
              return <Button key={company.id} disabled={!canManage} variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => setCompanyIds(current => selected ? current.filter(id => id !== company.id) : [...current,company.id])}>{company.name}</Button>
            })}</div>
            {canManage ? <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={canInvite} onChange={event => setCanInvite(event.target.checked)} />{t('users.canInvite')}</label> : null}
          </section>
        </fieldset>
      </div>
      <footer className="identity-invite-page-footer">
        {isEditing && canEdit ? <>
          <Button variant="secondary" disabled={isSaving} onClick={() => navigate('/system/core/employees')}>{t('users.cancel')}</Button>
          <Button type="submit" disabled={isSaving}>{t(isSaving ? 'users.saving' : 'users.saveChanges')}</Button>
        </> : <Button variant="secondary" onClick={() => navigate('/system/core/employees')}>{t('users.backToUsers')}</Button>}
      </footer>
    </form>}
  </div>
}
