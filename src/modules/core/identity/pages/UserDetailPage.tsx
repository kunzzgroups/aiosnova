import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import {
  IconBan,
  IconCircleCheck,
  IconShield,
  IconShieldOff,
  IconTrash,
} from '@/components/icons/Icons'
import {
  isIdentityProfileComplete,
  formatStatusLabel,
  type IdentityUser,
} from '@/modules/core/identity/types/identity'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import {
  isValidPassword,
  PASSWORD_CONFIRM_PLACEHOLDER,
  PASSWORD_CURRENT_PLACEHOLDER,
  PASSWORD_MISMATCH_MESSAGE,
} from '@/modules/core/auth/utils/passwordPolicy'
import {
  changeOwnPassword,
  deleteUser,
  fetchUser,
  updateUser,
  type MembershipWithLabels,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

function profileInitials(user: IdentityUser) {
  const source = (user.fullName || user.displayName || user.email).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

export function UserDetailPage() {
  const { t } = useTranslation()
  const { userId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionUser = useAuthStore((state) => state.user)

  const [user, setUser] = useState<IdentityUser | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithLabels[]>([])
  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === '1')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isSelf = Boolean(sessionUser && user && sessionUser.id === user.id)
  const confirmPasswordMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  const loadUser = useCallback(async () => {
    if (!userId) {
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchUser(userId)
      setUser(result.user)
      setMemberships(result.memberships)
      applyProfileForm(result.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errLoadUser'))
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  useEffect(() => {
    if (!message) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null)
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [message])

  function applyProfileForm(nextUser: IdentityUser) {
    setDisplayName(nextUser.displayName)
    setFullName(nextUser.fullName)
    setEmail(nextUser.email)
    setPhone(nextUser.phone)
    setAvatarUrl(nextUser.avatarUrl)
  }

  function syncSessionIfSelf(nextUser: IdentityUser) {
    if (sessionUser?.id === nextUser.id) {
      useAuthStore.getState().setUser({
        ...sessionUser,
        email: nextUser.email,
        name: nextUser.displayName,
        mfaEnabled: nextUser.mfaEnabled,
        profileComplete: isIdentityProfileComplete(nextUser),
      })
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateUser(user.id, {
        displayName,
        fullName,
        email,
        phone,
        avatarUrl,
      })
      setUser(updated)
      applyProfileForm(updated)
      syncSessionIfSelf(updated)
      setIsEditing(false)
      setMessage(t('users.msgProfileSaved'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errSaveProfile'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancelEdit() {
    if (user) {
      applyProfileForm(user)
    }
    setIsEditing(false)
  }

  async function handleToggleStatus() {
    if (!user) {
      return
    }
    const nextStatus = user.status === 'disabled' ? 'active' : 'disabled'
    setError(null)
    setMessage(null)
    try {
      const updated = await updateUser(user.id, { status: nextStatus })
      setUser(updated)
      setMessage(nextStatus === 'disabled' ? t('users.msgUserDisabled') : t('users.msgUserActivated'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errUpdateStatus'))
    }
  }

  function requestDelete() {
    if (isSelf) {
      setError(t('users.deleteSelf'))
      return
    }
    setError(null)
    setShowDeleteConfirm(true)
  }

  async function handleConfirmDelete() {
    if (!user) {
      return
    }
    setError(null)
    setMessage(null)
    setIsDeleting(true)
    try {
      await deleteUser(user.id)
      navigate('/system/core/users')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errDelete'))
      setIsDeleting(false)
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidPassword(newPassword)) {
      setError(t('auth.newPasswordPolicyError'))
      return
    }
    if (newPassword !== confirmPassword) {
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const result = await changeOwnPassword({ currentPassword, newPassword })
      setMessage(result.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errChangePassword'))
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="identity-page">
        <p className="identity-empty">{t('users.loading')}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="identity-page">
        <FlashToasts error={error} onClearError={() => setError(null)} />
        <Button variant="secondary" onClick={() => navigate('/system/core/users')}>
          Back to users
        </Button>
      </div>
    )
  }

  return (
    <div className="identity-page">
      <header className="identity-page__header identity-page__header--row identity-page__header--toolbar">
        <nav className="identity-breadcrumb" aria-label={t('users.breadcrumb')}>
          <Link to="/system/core/users">{t('users.title')}</Link>
          <span aria-hidden="true"> / </span>
          <h1>{user.displayName}</h1>
        </nav>
        <Button variant="ghost" onClick={() => navigate('/system/core/users')}>
          Back
        </Button>
      </header>

      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <section className="identity-panel">
        <div className="identity-panel__title-row">
          <h2>{t('users.profile')}</h2>
          <div className="identity-inline-actions">
            {!isEditing ? (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            ) : (
              <>
                <Button type="submit" form="profile-edit-form" disabled={isSaving}>
                  {isSaving ? t('users.saving') : t('users.save')}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </Button>
              </>
            )}
            {isSelf ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPasswordForm((open) => !open)
                  setError(null)
                }}
              >
                {showPasswordForm ? t('users.hideChangePassword') : t('users.changePassword')}
              </Button>
            ) : null}
            <IconButton
              label={user.mfaEnabled ? t('users.actionResetMfa') : t('users.actionRequireMfa')}
              onClick={() => navigate(`/mfa/setup?userId=${user.id}&mode=${user.mfaEnabled ? 'reset' : 'require'}`)}
            >
              {user.mfaEnabled ? <IconShieldOff /> : <IconShield />}
            </IconButton>
            <IconButton
              label={user.status === 'active' ? t('users.statusActive') : t('users.statusInactive')}
              variant={user.status === 'active' ? 'secondary' : 'danger'}
              onClick={() => void handleToggleStatus()}
            >
              {user.status === 'active' ? <IconCircleCheck /> : <IconBan />}
            </IconButton>
            <IconButton
              label={isSelf ? t('users.deleteSelf') : t('users.actionDelete')}
              variant="danger"
              onClick={requestDelete}
              disabled={isSelf}
            >
              <IconTrash />
            </IconButton>
          </div>
        </div>

        {isEditing ? (
          <form
            id="profile-edit-form"
            className="identity-profile-glance"
            onSubmit={(event) => void handleSaveProfile(event)}
          >
            <div className="identity-profile-hero">
              <div className="identity-profile-avatar" aria-hidden>
                {profileInitials({ ...user, displayName, fullName, email })}
              </div>
              <div className="identity-profile-hero__body">
                <p className="identity-profile-hero__name">{fullName || displayName}</p>
                <p className="identity-profile-hero__contact">
                  <span>{email}</span>
                  {phone ? <span>{phone}</span> : null}
                </p>
              </div>
              <div className="identity-profile-hero__pills">
                <span className={`identity-status identity-status--${user.status}`}>
                  {formatStatusLabel(user.status, t)}
                </span>
                {isIdentityProfileComplete({ fullName, phone }) ? (
                  <span className="identity-status identity-status--active">{t('users.complete')}</span>
                ) : (
                  <span className="identity-status identity-status--invited">{t('users.incomplete')}</span>
                )}
                <span className={`identity-status ${user.mfaEnabled ? 'identity-status--active' : 'identity-status--invited'}`}>
                  MFA {user.mfaEnabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            <div className="identity-profile-tiles">
              <label className="identity-profile-tile" htmlFor="detail-name">
                <span>{t('users.fieldDisplayName')}</span>
                <TextField
                  id="detail-name"
                  className="identity-profile-tile__input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="identity-profile-tile" htmlFor="detail-full">
                <span>{t('users.fieldFullName')}</span>
                <TextField
                  id="detail-full"
                  className="identity-profile-tile__input"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="identity-profile-tile" htmlFor="detail-email">
                <span>{t('users.fieldEmail')}</span>
                <TextField
                  id="detail-email"
                  className="identity-profile-tile__input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="identity-profile-tile" htmlFor="detail-phone">
                <span>{t('users.fieldPhone')}</span>
                <TextField
                  id="detail-phone"
                  className="identity-profile-tile__input"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  disabled={isSaving}
                />
              </label>
              <div className="identity-profile-tile">
                <span>{t('users.fieldCreated')}</span>
                <strong>{new Date(user.createdAt).toLocaleString()}</strong>
              </div>
            </div>
          </form>
        ) : (
          <div className="identity-profile-glance">
            <div className="identity-profile-hero">
              <div className="identity-profile-avatar" aria-hidden>
                {profileInitials(user)}
              </div>
              <div className="identity-profile-hero__body">
                <p className="identity-profile-hero__name">{user.fullName || user.displayName}</p>
                <p className="identity-profile-hero__contact">
                  <span>{user.email}</span>
                  {user.phone ? <span>{user.phone}</span> : null}
                </p>
              </div>
              <div className="identity-profile-hero__pills">
                <span className={`identity-status identity-status--${user.status}`}>
                  {formatStatusLabel(user.status, t)}
                </span>
                {isIdentityProfileComplete(user) ? (
                  <span className="identity-status identity-status--active">{t('users.complete')}</span>
                ) : (
                  <span className="identity-status identity-status--invited">{t('users.incomplete')}</span>
                )}
                <span className={`identity-status ${user.mfaEnabled ? 'identity-status--active' : 'identity-status--invited'}`}>
                  MFA {user.mfaEnabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            <div className="identity-profile-tiles">
              <div className="identity-profile-tile">
                <span>{t('users.fieldDisplayName')}</span>
                <strong>{user.displayName}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>{t('users.fieldFullName')}</span>
                <strong>{user.fullName || '—'}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>{t('users.fieldEmail')}</span>
                <strong>{user.email}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>{t('users.fieldPhone')}</span>
                <strong>{user.phone || '—'}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>{t('users.fieldCreated')}</span>
                <strong>{new Date(user.createdAt).toLocaleString()}</strong>
              </div>
            </div>
          </div>
        )}

        {isSelf && showPasswordForm ? (
          <form
            className="identity-form identity-profile-password"
            onSubmit={(event) => void handleChangePassword(event)}
          >
            <FormField label={t('users.fieldCurrentPassword')} htmlFor="current-password">
              <PasswordField
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={PASSWORD_CURRENT_PLACEHOLDER}
                autoComplete="current-password"
                disabled={isSaving}
              />
            </FormField>
            <FormField label={t('users.fieldNewPassword')} htmlFor="new-password">
              <PasswordField
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t('auth.passwordCreatePlaceholder')}
                autoComplete="new-password"
                showRequirements
                disabled={isSaving}
              />
            </FormField>
            <FormField
              label={t('users.fieldConfirmNewPassword')}
              htmlFor="confirm-password"
              error={confirmPasswordMismatch ? PASSWORD_MISMATCH_MESSAGE : undefined}
            >
              <PasswordField
                id="confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={PASSWORD_CONFIRM_PLACEHOLDER}
                autoComplete="new-password"
                hasError={confirmPasswordMismatch}
                disabled={isSaving}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t('users.updating') : t('users.updatePassword')}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="identity-panel">
        <div className="identity-panel__title-row">
          <h2>{t('users.memberships')}</h2>
          <Link className="identity-text-link" to="/system/core/membership">
            Open memberships
          </Link>
        </div>
        {memberships.length === 0 ? (
          <p className="identity-empty">{t('users.noMemberships')}</p>
        ) : (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('users.colCompany')}</th>
                  <th>{t('users.colOrganization')}</th>
                  <th>{t('users.colPosition')}</th>
                  <th>{t('users.colPrimary')}</th>
                  <th>{t('users.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((item) => (
                  <tr key={item.id}>
                    <td>{item.companyName ?? '—'}</td>
                    <td>{item.organizationName ?? '—'}</td>
                    <td>{item.positionName ?? '—'}</td>
                    <td>{item.isPrimary ? 'Yes' : 'No'}</td>
                    <td>
                      <span className={`identity-status identity-status--${item.status}`}>
                        {formatStatusLabel(item.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('users.deleteTitle')}
        description={
          <>
            This will permanently remove{' '}
            <strong>
              {user.displayName} ({user.email})
            </strong>{' '}
            and their memberships.
          </>
        }
        confirmLabel={t('users.deleteConfirm')}
        busy={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!isDeleting) {
            setShowDeleteConfirm(false)
          }
        }}
      />
    </div>
  )
}
