import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { ApiError } from '@/services/httpClient'
import type { IdentityUser, UserStatus } from '@/modules/core/identity/types/identity'
import {
  formatDirectoryMfa,
  formatLastActive,
  formatSignInMethod,
  formatStatusLabel,
  isIdentityProfileComplete,
} from '@/modules/core/identity/types/identity'
import {
  createUser,
  fetchUsers,
  sendUserPasswordReset,
  updateUser,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'disabled', label: 'Disabled' },
] as const

const MFA_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
] as const

const SIGN_IN_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'password', label: 'Password' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'apple', label: 'Apple' },
  { value: 'none', label: 'None' },
] as const

function matchesSearch(user: IdentityUser, query: string) {
  if (!query) {
    return true
  }
  const haystack = `${user.displayName} ${user.fullName} ${user.email}`.toLowerCase()
  return haystack.includes(query)
}

export function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<IdentityUser[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [signInFilter, setSignInFilter] = useState('all')
  const [mfaFilter, setMfaFilter] = useState('all')
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchUsers()
      setUsers(result.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load users.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!message) {
      return
    }
    const timeoutId = window.setTimeout(() => setMessage(null), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return users.filter((user) => {
      if (!matchesSearch(user, normalizedQuery)) {
        return false
      }
      if (statusFilter !== 'all' && user.status !== statusFilter) {
        return false
      }
      if (signInFilter === 'none' && user.signInMethod) {
        return false
      }
      if (signInFilter !== 'all' && signInFilter !== 'none' && user.signInMethod !== signInFilter) {
        return false
      }
      if (mfaFilter === 'enabled' && (!user.signInMethod || !user.mfaEnabled)) {
        return false
      }
      if (mfaFilter === 'disabled' && (!user.signInMethod || user.mfaEnabled)) {
        return false
      }
      return true
    })
  }, [users, query, statusFilter, signInFilter, mfaFilter])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createUser({ email, displayName, status: 'invited' })
      setEmail('')
      setDisplayName('')
      setShowInvite(false)
      setMessage('User invited. They can sign in with Password1!')
      await loadUsers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user: IdentityUser) {
    const nextStatus: UserStatus = user.status === 'disabled' ? 'active' : 'disabled'
    setError(null)
    setMessage(null)
    try {
      await updateUser(user.id, { status: nextStatus })
      await loadUsers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update user.')
    }
  }

  async function handleSendReset(user: IdentityUser) {
    setError(null)
    setMessage(null)
    try {
      const result = await sendUserPasswordReset(user.id)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send password reset.')
    }
  }

  return (
    <div className="identity-page">
      <header className="identity-page__header">
        <h1>Users</h1>
        <p>Identity / User — platform accounts and profiles (Layer 1 · 03).</p>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <section className="identity-panel">
        <h2>Directory</h2>
        <div className="identity-directory-toolbar">
          <TextField
            className="identity-directory-toolbar__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email..."
            aria-label="Search name or email"
          />
          <div className="identity-directory-toolbar__filters">
            <SidebarSelect
              id="directory-status"
              label="Status"
              value={statusFilter}
              options={[...STATUS_FILTERS]}
              onChange={setStatusFilter}
            />
            <SidebarSelect
              id="directory-signin"
              label="Sign-in method"
              value={signInFilter}
              options={[...SIGN_IN_FILTERS]}
              onChange={setSignInFilter}
            />
            <SidebarSelect
              id="directory-mfa"
              label="MFA"
              value={mfaFilter}
              options={[...MFA_FILTERS]}
              onChange={setMfaFilter}
            />
          </div>
          <div className="identity-directory-toolbar__invite">
            <Button
              variant={showInvite ? 'secondary' : 'primary'}
              onClick={() => setShowInvite((open) => !open)}
            >
              {showInvite ? 'Cancel' : 'Invite User'}
            </Button>
          </div>
        </div>

        {showInvite ? (
          <form className="identity-form identity-form--compact" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="Display name" htmlFor="user-name">
              <TextField
                id="user-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Email" htmlFor="user-email">
              <TextField
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Invite'}
              </Button>
            </div>
          </form>
        ) : null}

        {isLoading ? <p className="identity-empty">Loading…</p> : null}
        {!isLoading && users.length === 0 ? <p className="identity-empty">No users yet.</p> : null}
        {!isLoading && users.length > 0 && filteredUsers.length === 0 ? (
          <p className="identity-empty">No users match these filters.</p>
        ) : null}
        {filteredUsers.length > 0 ? (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Sign-in</th>
                  <th>MFA</th>
                  <th>Last active</th>
                  <th className="identity-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link className="identity-text-link" to={`/system/core/users/${user.id}`}>
                        {user.displayName}
                      </Link>
                      {!isIdentityProfileComplete(user) ? (
                        <span className="identity-status identity-status--invited identity-status--inline">
                          Incomplete
                        </span>
                      ) : null}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`identity-status identity-status--${user.status}`}>
                        {formatStatusLabel(user.status)}
                      </span>
                    </td>
                    <td>{formatSignInMethod(user.signInMethod)}</td>
                    <td>{formatDirectoryMfa(user)}</td>
                    <td>{formatLastActive(user.lastActiveAt)}</td>
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => navigate(`/system/core/users/${user.id}`)}
                        >
                          View
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => navigate(`/system/core/users/${user.id}?edit=1`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => void handleSendReset(user)}
                          disabled={user.status === 'disabled' || Boolean(user.signInMethod && user.signInMethod !== 'password')}
                        >
                          Send reset
                        </Button>
                        {user.signInMethod ? (
                          <Button
                            variant="secondary"
                            size="md"
                            onClick={() => navigate(`/mfa/setup?userId=${user.id}`)}
                          >
                            {user.mfaEnabled ? 'Disable MFA' : 'Enable MFA'}
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => void handleToggleStatus(user)}
                        >
                          {user.status === 'disabled' ? 'Activate' : 'Disable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
