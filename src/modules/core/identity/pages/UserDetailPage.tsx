import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import type { IdentityUser } from '@/modules/core/identity/types/identity'
import {
  changeOwnPassword,
  fetchUser,
  sendUserPasswordReset,
  updateUser,
  type MembershipWithLabels,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function UserDetailPage() {
  const { userId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionUser = useAuthStore((state) => state.user)

  const [user, setUser] = useState<IdentityUser | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithLabels[]>([])
  const [displayName, setDisplayName] = useState('')
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
      setDisplayName(result.user.displayName)
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
    }, 2000)

    return () => window.clearTimeout(timeoutId)
  }, [message])

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateUser(user.id, { displayName })
      setUser(updated)
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
      setDisplayName(user.displayName)
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
      <header className="identity-page__header identity-page__header--row">
        <div>
          <p className="identity-breadcrumb">
            <Link to="/system/core/users">Users</Link>
            <span aria-hidden="true"> / </span>
            <span>{user.displayName}</span>
          </p>
          <h1>{user.displayName}</h1>
          <p>Identity / User detail — profile, security, and memberships.</p>
        </div>
        <div className="identity-inline-actions">
          {!isEditing ? (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Edit profile
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void handleSendReset()}>
            Send password reset
          </Button>
          <Button
            variant={user.status === 'disabled' ? 'primary' : 'danger'}
            onClick={() => void handleToggleStatus()}
          >
            {user.status === 'disabled' ? 'Activate' : 'Disable'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/system/core/users')}>
            Back
          </Button>
        </div>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <section className="identity-panel">
        <h2>Profile</h2>
        <div className="identity-profile-row">
          <div className="identity-profile-row__main">
            {isEditing ? (
              <form className="identity-form" onSubmit={(event) => void handleSaveProfile(event)}>
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
              <dl className="identity-dl">
                <div>
                  <dt>Display name</dt>
                  <dd>{user.displayName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`identity-status identity-status--${user.status}`}>{user.status}</span>
                  </dd>
                </div>
                <div>
                  <dt>MFA</dt>
                  <dd>{user.mfaEnabled ? 'On' : 'Off'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{new Date(user.createdAt).toLocaleString()}</dd>
                </div>
              </dl>
            )}
          </div>
          {isSelf ? (
            <div className="identity-profile-row__security">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPasswordForm((open) => !open)
                  setError(null)
                }}
              >
                {showPasswordForm ? 'Hide change password' : 'Change password'}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/mfa/setup')}>
                Manage MFA
              </Button>
            </div>
          ) : null}
        </div>

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
                        {item.status}
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
