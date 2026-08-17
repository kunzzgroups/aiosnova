import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import {
  PROFILE_LANGUAGES,
  PROFILE_TIMEZONES,
  isIdentityProfileComplete,
  formatStatusLabel,
  type IdentityUser,
} from '@/modules/core/identity/types/identity'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import {
  changeOwnPassword,
  fetchUser,
  sendUserPasswordReset,
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

function profileLabel(
  items: readonly { value: string; label: string }[],
  value: string,
) {
  return items.find((item) => item.value === value)?.label ?? value ?? '—'
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
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur')
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === '1')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const isSelf = Boolean(sessionUser && user && sessionUser.id === user.id)

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
    setPhone(nextUser.phone)
    setAvatarUrl(nextUser.avatarUrl)
    setLanguage(nextUser.language || 'en')
    setTimezone(nextUser.timezone || 'Asia/Kuala_Lumpur')
  }

  function syncSessionIfSelf(nextUser: IdentityUser) {
    if (sessionUser?.id === nextUser.id) {
      useAuthStore.getState().setUser({
        ...sessionUser,
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
        phone,
        avatarUrl,
        language,
        timezone,
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

  async function handleSendReset() {
    if (!user) {
      return
    }
    setError(null)
    setMessage(null)
    try {
      const result = await sendUserPasswordReset(user.id)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send password reset.')
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
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
        {error ? <Alert variant="error">{error}</Alert> : null}
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

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <section className="identity-panel">
        <div className="identity-panel__title-row">
          <h2>Profile</h2>
          <div className="identity-inline-actions">
            {!isEditing ? (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            ) : null}
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
            <Button
              variant="secondary"
              onClick={() => navigate(`/mfa/setup?userId=${user.id}`)}
            >
              {user.mfaEnabled ? 'Disable MFA' : 'Enable MFA'}
            </Button>
            <Button variant="secondary" onClick={() => void handleSendReset()}>
              Send Password Reset
            </Button>
            <Button
              variant={user.status === 'disabled' ? 'primary' : 'danger'}
              onClick={() => void handleToggleStatus()}
            >
              {user.status === 'disabled' ? 'Activate' : 'Disable'}
            </Button>
          </div>
        </div>

        {isEditing ? (
          <form className="identity-form identity-form--profile" onSubmit={(event) => void handleSaveProfile(event)}>
            <FormField label="Display name" htmlFor="detail-name">
              <TextField
                id="detail-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Email" htmlFor="detail-email">
              <TextField id="detail-email" value={user.email} disabled />
            </FormField>
            <FormField label="Full name" htmlFor="detail-full">
              <TextField
                id="detail-full"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Phone" htmlFor="detail-phone">
              <TextField
                id="detail-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Language" htmlFor="detail-language">
              <SidebarSelect
                id="detail-language"
                label="Language"
                hideLabel
                value={language}
                options={[...PROFILE_LANGUAGES]}
                onChange={setLanguage}
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Timezone" htmlFor="detail-timezone">
              <SidebarSelect
                id="detail-timezone"
                label="Timezone"
                hideLabel
                value={timezone}
                options={[...PROFILE_TIMEZONES]}
                onChange={setTimezone}
                disabled={isSaving}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancelEdit} disabled={isSaving}>
                Cancel
              </Button>
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
                <span>Language</span>
                <strong>{profileLabel(PROFILE_LANGUAGES, user.language)}</strong>
              </div>
              <div className="identity-profile-tile">
                <span>Timezone</span>
                <strong>{profileLabel(PROFILE_TIMEZONES, user.timezone)}</strong>
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
            className="identity-form identity-form--stack identity-profile-password"
            onSubmit={(event) => void handleChangePassword(event)}
          >
            <FormField label="Current password" htmlFor="current-password">
              <TextField
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
                disabled={isSaving}
              />
            </FormField>
            <FormField label="New password" htmlFor="new-password">
              <TextField
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirm-password">
              <TextField
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
    </div>
  )
}
