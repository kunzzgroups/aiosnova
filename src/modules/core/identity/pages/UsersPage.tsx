import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import type { IdentityUser } from '@/modules/core/identity/types/identity'
import { isIdentityProfileComplete } from '@/modules/core/identity/types/identity'
import {
  createUser,
  fetchUsers,
  sendUserPasswordReset,
  updateUser,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<IdentityUser[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createUser({ email, displayName, status: 'invited' })
      setEmail('')
      setDisplayName('')
      setMessage('User invited.')
      await loadUsers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user: IdentityUser) {
    const nextStatus = user.status === 'disabled' ? 'active' : 'disabled'
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
        <h2>Invite user</h2>
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
      </section>

      <section className="identity-panel">
        <h2>Directory</h2>
        {isLoading ? <p className="identity-empty">Loading…</p> : null}
        {!isLoading && users.length === 0 ? <p className="identity-empty">No users yet.</p> : null}
        {users.length > 0 ? (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>MFA</th>
                    <th className="identity-table__actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
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
                          {user.status}
                        </span>
                      </td>
                      <td>{user.mfaEnabled ? 'On' : 'Off'}</td>
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
                          disabled={user.status === 'disabled'}
                        >
                          Send reset
                        </Button>
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
