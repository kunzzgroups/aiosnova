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
import { useCompanyStore } from '@/stores/companyStore'
import { isIdentityProfileComplete, type IdentityUser, type InvitationOptions } from '@/modules/core/identity/types/identity'
import {
  fetchUser, fetchUsers, fetchInvitationOptions, updateUser, type MembershipWithLabels, fetchRoleOptions, fetchUserRoleIds, type RoleOption
} from '@/modules/core/identity/services/identityService'
import { hasPermission } from '@/modules/core/auth/utils/permissions'
import { fetchInvitationOrganization } from '@/modules/core/identity/services/organizationService'
import { RoleSelection } from '../components/RoleSelection'
import './IdentityPage.css'
import './UserDetailPage.css'

type ProfileSnapshot = {
  email: string
  fullName: string
  phone: string
  departmentId: string
  positionId: string
  companyIds: string[]
  requireMfa: boolean
  canInvite: boolean
}

export function UserDetailPage() {
  const { t } = useTranslation()
  const { userId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setShellHeader = useContext(AppShellHeaderContext)
  const sessionUser = useAuthStore(state => state.user)
  const canAssignRoles = hasPermission(sessionUser, 'roles.assign')
  const companyId = useCompanyStore(state => state.companyId)
  const accessToken = useAuthStore(state => state.accessToken)
  const loadGeneration = useRef(0)
  const loadController = useRef<AbortController | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [user, setUser] = useState<IdentityUser | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithLabels[]>([])
  const [options, setOptions] = useState<InvitationOptions | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isEditing] = useState(searchParams.get('edit') === '1')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [requireMfa, setRequireMfa] = useState(false)
  const [canInvite, setCanInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const saveInFlight = useRef(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedProfile, setSavedProfile] = useState<ProfileSnapshot | null>(null)
  const canManage = isOwner || isAdmin
  const canEditProfile = canManage || sessionUser?.id === userId
  const canEdit = canEditProfile || canAssignRoles
  const department = options?.departments.find(item => item.id === departmentId)
  const currentPlacement = memberships.find(item => item.companyId === companyId)
  const departmentInactive = currentPlacement?.organizationId === departmentId && currentPlacement.organizationInactive && !currentPlacement.organizationDeleted
  const positionInactive = currentPlacement?.positionId === positionId && currentPlacement.positionInactive && !currentPlacement.positionDeleted
  const policyMfa = companyIds.some(id => options?.companies.find(company => company.id === id)?.requireMfa)
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [savedRoleIds, setSavedRoleIds] = useState<string[]>([])
  const [isRolesLoading, setIsRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const rolesChanged =
    selectedRoleIds.length !== savedRoleIds.length ||
    selectedRoleIds.some(id => !savedRoleIds.includes(id))
  const addedRoles = selectedRoleIds.filter(id => !savedRoleIds.includes(id)).length
  const removedRoles = savedRoleIds.filter(id => !selectedRoleIds.includes(id)).length
  const addedCompanies = companyIds.filter(id => !savedProfile?.companyIds.includes(id)).length
  const removedCompanies = savedProfile?.companyIds.filter(id => !companyIds.includes(id)).length ?? 0
  const companiesChanged = canManage && (addedCompanies > 0 || removedCompanies > 0)
  const inviteChanged = canManage && savedProfile !== null && canInvite !== savedProfile.canInvite
  const profileChanged = canEditProfile && savedProfile !== null && (
    email.trim().toLowerCase() !== savedProfile.email ||
    fullName.trim() !== savedProfile.fullName ||
    phone.trim() !== savedProfile.phone ||
    (canManage && (
      departmentId !== savedProfile.departmentId ||
      positionId !== savedProfile.positionId ||
      requireMfa !== savedProfile.requireMfa
    ))
  )
  const hasChanges = profileChanged || companiesChanged || inviteChanged || (canAssignRoles && rolesChanged)
  const changesSummary = [
    canAssignRoles && rolesChanged ? t('users.editRoleChanges', { added: addedRoles, removed: removedRoles }) : '',
    companiesChanged ? t('users.editCompanyChanges', { added: addedCompanies, removed: removedCompanies }) : '',
    inviteChanged ? t('users.editInviteChanged') : '',
    profileChanged ? t('users.editProfileChanged') : '',
  ].filter(Boolean).join(' · ')

  useEffect(() => {
    const controller = new AbortController()

    setRoleOptions([])
    setSelectedRoleIds([])
    setSavedRoleIds([])
    setRolesError(null)

    if (!canAssignRoles || !accessToken?.startsWith('backend_') || !userId) {
      setIsRolesLoading(false)
      return () => controller.abort()
    }

    async function loadRoles() {
      setIsRolesLoading(true)

      try {
        const [options, roleIds] = await Promise.all([
          fetchRoleOptions(controller.signal),
          fetchUserRoleIds(userId, controller.signal),
        ])
        if (controller.signal.aborted) return

        setRoleOptions(options)
        setSelectedRoleIds([...roleIds])
        setSavedRoleIds([...roleIds])
      } catch (error) {
        if (controller.signal.aborted) return
        setRolesError('users.rolesLoadFailed')
      } finally {
        if (!controller.signal.aborted) {
          setIsRolesLoading(false)
        }
      }

    }

    void loadRoles()

    return () => controller.abort()
  }, [canAssignRoles, accessToken, userId])

  function toggleUserRole(roleId: string) {
    if (!canAssignRoles || !isEditing || isRolesLoading || isSaving || rolesError) return
    setSelectedRoleIds(current =>
      current.includes(roleId)
        ? current.filter(id => id !== roleId)
        : [...current, roleId]
    )
  }

  function applyProfileForm(nextUser: IdentityUser, assignments: MembershipWithLabels[]) {
    const nextDepartmentId = assignments.some(item => item.companyId === companyId) ? assignments.find(item => item.companyId === companyId)?.organizationId || '' : nextUser.departmentId || ''
    const nextPositionId = assignments.some(item => item.companyId === companyId) ? assignments.find(item => item.companyId === companyId)?.positionId || '' : nextUser.positionId || ''
    const nextCompanyIds = assignments.map(item => item.companyId).filter((id): id is string => Boolean(id))
    setEmail(nextUser.email)
    setFullName(nextUser.fullName || nextUser.displayName)
    setPhone(nextUser.phone)
    setDepartmentId(nextDepartmentId)
    setPositionId(nextPositionId)
    setCompanyIds(nextCompanyIds)
    setRequireMfa(Boolean(nextUser.requireMfa))
    setCanInvite(Boolean(nextUser.canInvite))
    setSavedProfile({
      email: nextUser.email.trim().toLowerCase(),
      fullName: (nextUser.fullName || nextUser.displayName).trim(),
      phone: nextUser.phone.trim(),
      departmentId: nextDepartmentId,
      positionId: nextPositionId,
      companyIds: nextCompanyIds,
      requireMfa: Boolean(nextUser.requireMfa),
      canInvite: Boolean(nextUser.canInvite),
    })
  }

  const loadUser = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    const generation = ++loadGeneration.current
    setIsLoading(true)
    setError(null)
    setSaveError(null)
    try {
      const [result, invitationOptions, directory] = await Promise.all([fetchUser(userId, controller.signal), fetchInvitationOptions(controller.signal), accessToken?.startsWith('backend_') ? Promise.resolve({ items: [] as IdentityUser[] }) : fetchUsers(controller.signal)])
      if (accessToken?.startsWith('backend_') && (sessionUser?.isOwner || sessionUser?.canManageUsers)) {
        const catalog = await fetchInvitationOrganization(companyId, controller.signal)
        invitationOptions.departments = catalog.departments
      }
      if (accessToken?.startsWith('backend_')) {
        const currentMembership = result.memberships.find(item => item.companyId === companyId)
        const currentDepartmentId = currentMembership ? currentMembership.organizationId : result.user.departmentId
        const currentPositionId = currentMembership ? currentMembership.positionId : result.user.positionId
        const assignment = result.memberships.find(item => item.organizationId === currentDepartmentId)
        if (currentDepartmentId && !invitationOptions.departments.some(item => item.id === currentDepartmentId)) invitationOptions.departments = [...invitationOptions.departments, { id: currentDepartmentId, name: assignment?.organizationName || currentDepartmentId, positions: [] }]
        const currentDepartment = invitationOptions.departments.find(item => item.id === currentDepartmentId)
        if (currentDepartment && currentPositionId && !currentDepartment.positions.some(item => item.id === currentPositionId)) currentDepartment.positions = [...currentDepartment.positions, { id: currentPositionId, name: assignment?.positionName || currentPositionId }]
      }
      if (generation !== loadGeneration.current || useCompanyStore.getState().companyId !== companyId) return
      setUser(result.user)
      setMemberships(result.memberships)
      setOptions(invitationOptions)
      setIsOwner(Boolean(sessionUser?.isOwner) || directory.items.some(item => item.id === sessionUser?.id && item.isOwner))
      setIsAdmin(Boolean(sessionUser?.canManageUsers) || directory.items.some(item => item.id === sessionUser?.id && item.canManageUsers))
      applyProfileForm(result.user, result.memberships)
    } catch (err) {
      if (!controller.signal.aborted && generation === loadGeneration.current) { setError(err instanceof ApiError ? err.message : t('users.errLoadUser')); setUser(null) }
    } finally { if (generation === loadGeneration.current) setIsLoading(false) }
  }, [userId, sessionUser?.id, companyId, accessToken])
  useEffect(() => { void loadUser(); return () => { loadController.current?.abort(); loadGeneration.current++ } }, [loadUser])
  useEffect(() => {
    setShellHeader({ titleKey: isEditing ? 'users.editUserTitle' : 'users.viewUserTitle', descriptionKey: 'users.profileDescription' })
    return () => setShellHeader(null)
  }, [isEditing, setShellHeader])
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('.sidebar__footer')
    const page = pageRef.current
    if (!footer || !page) return
    const align = () => {
      const height = window.innerHeight - footer.getBoundingClientRect().top
      page.style.setProperty('--invitation-footer-height', height + 'px')
      const control = footer.querySelector<HTMLElement>('.sidebar__logout')?.getBoundingClientRect()
      if (control) page.style.setProperty('--invitation-footer-offset', (control.top + control.height / 2 - (window.innerHeight - height / 2)) + 'px')
    }
    const observer = new ResizeObserver(align)
    observer.observe(footer)
    window.addEventListener('resize', align)
    align()
    return () => { observer.disconnect(); window.removeEventListener('resize', align) }
  }, [])

  useEffect(() => {
    if (!isEditing || !hasChanges) return
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (saveInFlight.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isEditing, hasChanges])

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !user ||
      !canEdit ||
      !isEditing ||
      !hasChanges ||
      isSaving ||
      saveInFlight.current ||
      (canAssignRoles && (isRolesLoading || !!rolesError))
    ) return

    saveInFlight.current = true
    setIsSaving(true)
    setError(null)
    setSaveError(null)
    try {
      const updated = await updateUser(user.id, {
        version: user.version,
        ...(canAssignRoles && rolesChanged
          ? { roleIds: [...selectedRoleIds] }
          : {}),
        ...(canEditProfile ? {
          email: email.trim(), fullName: fullName.trim(), displayName: fullName.trim(), phone: phone.trim(),
        } : {}),
        ...(canManage ? { requireMfa, canInvite } : {}),
        ...(canManage ? {
          departmentId, positionId,
          assignments: companyIds.map(companyId => {
            const existing = memberships.find(item => item.companyId === companyId)
            const teamChanged = departmentId !== (user.departmentId ?? memberships[0]?.organizationId ?? '') || positionId !== (user.positionId ?? memberships[0]?.positionId ?? '')
            return { companyId, organizationId: existing && !teamChanged ? (existing.organizationId ?? '') : departmentId, positionId: existing && !teamChanged ? (existing.positionId ?? '') : positionId, roleIds: existing?.roleIds ?? [] }
          })
        } : {}),
      })
      if (sessionUser?.id === updated.id) useAuthStore.getState().setUser({ ...sessionUser, email: updated.email, name: updated.displayName, mfaEnabled: updated.mfaEnabled, profileComplete: isIdentityProfileComplete(updated), isOwner: updated.isOwner, canManageUsers: updated.canManageUsers })
      navigate('/system/core/employees', { state: { profileSaved: true } })
    } catch (err) {
      const failure = err instanceof ApiError ? err.message : t('users.errSaveProfile')
      setError(failure)
      setSaveError(failure)
    }
    finally { saveInFlight.current = false; setIsSaving(false) }
  }

  return <div ref={pageRef} className="identity-page identity-users-page identity-users-page--inviting identity-user-detail-page">
    <FlashToasts error={error} message={message} onClearError={() => setError(null)} onClearMessage={() => setMessage(null)} />
    {isLoading ? <div className="identity-invite identity-invite--page identity-profile-skeleton" role="status" aria-label={t('users.loading')} aria-busy="true">
      <div className="identity-invite-content" aria-hidden="true"><div className="identity-invite-sections">
        <section className="identity-panel"><div className="identity-profile-skeleton__heading" /><div className="identity-invite-fields">{[0, 1, 2, 3, 4].map(index => <div className="identity-profile-skeleton__field" key={index}><span /><div /></div>)}</div></section>
        <section className="identity-panel"><div className="identity-profile-skeleton__heading" /><div className="identity-profile-skeleton__hint" /><div className="identity-company-buttons">{[0, 1, 2].map(index => <div className="identity-profile-skeleton__company" key={index} />)}</div></section>
      </div></div><footer className="identity-invite-page-footer" aria-hidden="true"><div className="identity-profile-skeleton__button" /></footer>
    </div> : !user ? <Button variant="secondary" onClick={() => navigate('/system/core/employees')}>{t('users.backToUsers')}</Button> :
      <form className="identity-invite identity-invite--page" onSubmit={event => void handleSaveProfile(event)}>
        <div className="identity-invite-content">
          <fieldset className="identity-invite-sections" disabled={!isEditing || !canEditProfile || isSaving}>
            <section className="identity-panel">
              <h3>{t('users.basicInformation')}</h3>
              <div className="identity-invite-fields">
                <FormField label={t('users.workEmail')} htmlFor="profile-email"><TextField id="profile-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></FormField>
                <FormField label={t('users.fieldFullName')} htmlFor="profile-name"><TextField id="profile-name" required value={fullName} onChange={event => setFullName(event.target.value)} /></FormField>
                <FormField label={t('users.optionalPhone')} htmlFor="profile-phone"><TextField id="profile-phone" type="tel" value={phone && !canEditProfile ? '••••••••' : phone} onChange={event => setPhone(event.target.value)} /></FormField>
                <FormField label={<>{t('users.optionalDepartment')}{departmentInactive ? <span className="identity-profile-inactive">{t('users.statusInactive')}</span> : null}</>} htmlFor="profile-department" hint={memberships.some(item => item.organizationId === departmentId && item.organizationDeleted) ? t('users.removedDepartment') : undefined}><SidebarSelect id="profile-department" title={department?.name} hideLabel label={t('users.department')} value={departmentId} disabled={!canManage} options={[{ value: '', label: t('users.selectDepartment') }, ...(options?.departments.map(item => ({ value: item.id, label: item.name })) ?? [])]} onChange={id => { setDepartmentId(id); const positions = options?.departments.find(item => item.id === id)?.positions ?? []; setPositionId(positions.length === 1 ? positions[0]!.id : '') }} /></FormField>
                <FormField label={<>{t('users.optionalPosition')}{positionInactive ? <span className="identity-profile-inactive">{t('users.statusInactive')}</span> : null}</>} htmlFor="profile-position" hint={memberships.some(item => item.positionId === positionId && item.positionDeleted) ? t('users.removedPosition') : undefined}><SidebarSelect id="profile-position" title={department?.positions.find(item => item.id === positionId)?.name} hideLabel label={t('users.colPosition')} value={positionId} disabled={!canManage || !department} options={[{ value: '', label: t('users.selectPosition') }, ...(department?.positions.map(item => ({ value: item.id, label: item.name })) ?? [])]} onChange={setPositionId} /></FormField>
              </div>
              {canManage ? <>
                <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={requireMfa || policyMfa} disabled={policyMfa} onChange={event => setRequireMfa(event.target.checked)} />{t('users.actionRequireMfa')}</label>
                {policyMfa ? <p className="identity-directory-muted">{t('users.companyPolicyMfa')}</p> : null}
                <p className="identity-directory-muted">{t('users.profileMfaHint')}</p>
              </> : null}
            </section>
            <section className="identity-panel user-access-companies">
              <div className="user-access-heading"><h3>{t('users.companySelection')}</h3><span>{t('users.editCompanyCount', { count: companyIds.length })}</span></div>
              <p className="identity-directory-muted">{t(isEditing && canManage ? 'users.editCompanySelectionHint' : 'users.viewCompanySelectionHint')}</p>
              <div className="identity-company-buttons">{options?.companies.map(company => {
                const selected = companyIds.includes(company.id)
                return <Button key={company.id} disabled={!canManage} variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => setCompanyIds(current => selected ? current.filter(id => id !== company.id) : [...current, company.id])}>{company.name}</Button>
              })}</div>
              {canManage ? <label className="identity-invite-switch"><input type="checkbox" role="switch" checked={canInvite} onChange={event => setCanInvite(event.target.checked)} />{t('users.canInvite')}</label> : null}
            </section>
          </fieldset>
            {canAssignRoles && accessToken?.startsWith('backend_') ? (
              <section className="identity-panel user-access-roles" aria-busy={isRolesLoading}>
                <h3>{t('users.rolesTitle')}</h3>
                <p className="identity-directory-muted user-access-roles__description">{t(isEditing ? 'users.editRoleSelectionHint' : 'users.viewRoleSelectionHint')}</p>

                {isRolesLoading ? (
                  <p role="status">{t('users.rolesLoading')}</p>
                ) : rolesError ? (
                  <p role="alert">{t(rolesError)}</p>
                ) : (
                  <RoleSelection
                    key={userId}
                    roles={roleOptions}
                    selectedIds={selectedRoleIds}
                    savedIds={savedRoleIds}
                    onToggle={toggleUserRole}
                    disabled={isSaving}
                    readOnly={!isEditing}
                  />
                )}
              </section>
            ) : null}
        </div>
        <footer className="identity-invite-page-footer user-edit-footer">
          {isEditing && canEdit && <div className="user-edit-footer__summary" aria-live="polite" aria-atomic="true">
            <strong>{t(isSaving ? 'users.editSavingAll' : hasChanges ? 'users.editPendingChanges' : 'users.editNoChanges')}</strong>
            {changesSummary && <span>{changesSummary}</span>}
            {saveError && <span className="user-edit-footer__error" role="alert">{saveError}</span>}
          </div>}
          <div className="user-edit-footer__actions">
          {isEditing && canEdit ? <>
            <Button variant="secondary" disabled={isSaving} onClick={() => navigate('/system/core/employees')}>{t('users.cancel')}</Button>
            <Button type="submit" aria-busy={isSaving} disabled={isSaving || !hasChanges || (canAssignRoles && (isRolesLoading || !!rolesError))}>
              {isSaving && <span className="user-edit-footer__spinner" aria-hidden="true" />}
              {t(isSaving ? 'users.saving' : 'users.saveChanges')}
            </Button>
          </> : <Button variant="secondary" onClick={() => navigate('/system/core/employees')}>{t('users.backToUsers')}</Button>}
          </div>
        </footer>
      </form>}
  </div>
}
