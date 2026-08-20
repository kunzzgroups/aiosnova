import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
  NEW_PASSWORD_ERROR_MESSAGE,
  PASSWORD_CONFIRM_PLACEHOLDER,
  PASSWORD_CREATE_PLACEHOLDER,
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
      setError(err instanceof ApiError ? err.message : 'Unable to load user.')
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
      setMessage('Profile saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save profile.')
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
      setMessage(nextStatus === 'disabled' ? 'User disabled.' : 'User activated.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update status.')
    }
  }

  function requestDelete() {
    if (isSelf) {
      setError('You cannot delete your own account.')
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
      setError(err instanceof ApiError ? err.message : 'Unable to delete user.')
      setIsDeleting(false)
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidPassword(newPassword)) {
      setError(NEW_PASSWORD_ERROR_MESSAGE)
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
      setError(err instanceof ApiError ? err.message : 'Unable to change password.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="identity-page">
        <p className="identity-empty">Loading…</p>
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
        <nav className="identity-breadcrumb" aria-label="Breadcrumb">
          <Link to="/system/core/users">Users</Link>
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
          <h2>Profile</h2>
          <div className="identity-inline-actions">
            {!isEditing ? (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            ) : (
              <>
                <Button type="submit" form="profile-edit-form" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
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
                {showPasswordForm ? 'Hide Change Password' : 'Change Password'}
              </Button>
            ) : null}
            <IconButton
              label={user.mfaEnabled ? 'Reset MFA' : 'Require MFA'}
              onClick={() => navigate(`/mfa/setup?userId=${user.id}&mode=${user.mfaEnabled ? 'reset' : 'require'}`)}
            >
              {user.mfaEnabled ? <IconShieldOff /> : <IconShield />}
            </IconButton>
            <IconButton
              label={user.status === 'active' ? 'Active' : 'Inactive'}
              variant={user.status === 'active' ? 'secondary' : 'danger'}
              onClick={() => void handleToggleStatus()}
            >
              {user.status === 'active' ? <IconCircleCheck /> : <IconBan />}
            </IconButton>
            <IconButton
              label={isSelf ? 'You cannot delete your own account' : 'Delete'}
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
                  {formatStatusLabel(user.status)}
                </span>
                {isIdentityProfileComplete({ fullName, phone }) ? (
                  <span className="identity-status identity-status--active">Complete</span>
                ) : (
                  <span className="identity-status identity-status--invited">Incomplete</span>
                )}
                <span className={`identity-status ${user.mfaEnabled ? 'identity-status--active' : 'identity-status--invited'}`}>
                  MFA {user.mfaEnabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            <div className="identity-profile-tiles">
              <label className="identity-profile-tile" htmlFor="detail-name">
                <span>Display name</span>
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
                <span>Full name</span>
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
                <span>Email</span>
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
                <span>Phone</span>
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
                <span>Created</span>
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
                  {formatStatusLabel(user.status)}
                </span>
                {isIdentityProfileComplete(user) ? (
                  <span className="identity-status identity-status--active">Complete</span>
                ) : (
                  <span className="identity-status identity-status--invited">Incomplete</span>
                )}
                <span className={`identity-status ${user.mfaEnabled ? 'identity-status--active' : 'identity-status--invited'}`}>
                  MFA {user.mfaEnabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            <div className="identity-profile-tiles">
              <div className="identity-profile-tile">
                <span>Display name</span>
                <strong>{user.displayName}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>Full name</span>
                <strong>{user.fullName || '—'}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>Phone</span>
                <strong>{user.phone || '—'}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>Created</span>
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
            <FormField label="Current password" htmlFor="current-password">
              <PasswordField
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={PASSWORD_CURRENT_PLACEHOLDER}
                autoComplete="current-password"
                disabled={isSaving}
              />
            </FormField>
            <FormField label="New password" htmlFor="new-password">
              <PasswordField
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder={PASSWORD_CREATE_PLACEHOLDER}
                autoComplete="new-password"
                showRequirements
                disabled={isSaving}
              />
            </FormField>
            <FormField
              label="Confirm new password"
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
                {isSaving ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="identity-panel">
        <div className="identity-panel__title-row">
          <h2>Memberships</h2>
          <Link className="identity-text-link" to="/system/core/membership">
            Open memberships
          </Link>
        </div>
        {memberships.length === 0 ? (
          <p className="identity-empty">No memberships for this user.</p>
        ) : (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Organization</th>
                  <th>Position</th>
                  <th>Primary</th>
                  <th>Status</th>
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
                        {formatStatusLabel(item.status)}
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
        title="Delete this user?"
        description={
          <>
            This will permanently remove{' '}
            <strong>
              {user.displayName} ({user.email})
            </strong>{' '}
            and their memberships.
          </>
        }
        confirmLabel="Delete user"
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
