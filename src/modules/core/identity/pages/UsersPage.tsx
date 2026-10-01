import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  IconSearch,
  IconShield,
  IconShieldOff,
  IconTrash,
} from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import type { CompanyListItem } from '@/modules/core/identity/services/identityService'
import type { IdentityUser, SignInMethod, UserStatus } from '@/modules/core/identity/types/identity'
import {
  formatDirectoryMfa,
  formatLastActive,
  formatSignInMethod,
  formatStatusLabel,
  isIdentityProfileComplete,
} from '@/modules/core/identity/types/identity'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { isValidPassword } from '@/modules/core/auth/utils/passwordPolicy'
import {
  createUser,
  deleteUser,
  fetchCompanies,
  fetchUsers,
  updateUser,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

const STATUS_FILTERS = ['all', 'active', 'invited', 'disabled'] as const

const MFA_FILTERS = ['all', 'enabled', 'disabled'] as const

const SIGN_IN_FILTERS = ['all', 'password', 'google', 'facebook', 'apple', 'none'] as const

function matchesSearch(user: IdentityUser, query: string) {
  if (!query) {
    return true
  }
  const haystack = `${user.displayName} ${user.fullName} ${user.email}`.toLowerCase()
  return haystack.includes(query)
}

function randomItem(items: string) {
  const index = crypto.getRandomValues(new Uint32Array(1))[0]! % items.length
  return items[index]!
}

function generatePassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*'
  const all = `${upper}${lower}${digits}${symbols}`
  const chars = [randomItem(upper), randomItem(lower), randomItem(digits), randomItem(symbols)]
  while (chars.length < length) {
    chars.push(randomItem(all))
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1)
    const current = chars[i]!
    chars[i] = chars[j]!
    chars[j] = current
  }
  return chars.join('')
}

export function UsersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Filter values are plain strings in the module-level constant; labels are
  // resolved here so they follow the active locale.
  const statusLabel = (value: string) =>
    value === 'all' ? t('users.filterAll') : formatStatusLabel(value, t)
  const mfaLabel = (value: string) =>
    value === 'all'
      ? t('users.filterAll')
      : value === 'enabled'
        ? t('users.mfaEnabled')
        : t('users.mfaDisabled')
  const signInLabel = (value: string) =>
    value === 'all'
      ? t('users.filterAll')
      : value === 'none'
        ? t('users.methodNone')
        : formatSignInMethod(value as SignInMethod, t)
  const sessionUser = useAuthStore((state) => state.user)
  const [users, setUsers] = useState<IdentityUser[]>([])
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRevealed, setPasswordRevealed] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [signInFilter, setSignInFilter] = useState('all')
  const [mfaFilter, setMfaFilter] = useState('all')
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<IdentityUser | null>(null)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [usersResult, companiesResult] = await Promise.all([fetchUsers(), fetchCompanies()])
      setUsers(usersResult.items)
      const activeCompanies = companiesResult.items.filter((item) => item.status === 'active')
      setCompanies(activeCompanies)
      setCompanyId((current) => current || activeCompanies[0]?.id || '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errLoad'))
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

  function resetInviteForm() {
    setEmail('')
    setPassword('')
    setPasswordRevealed(false)
  }

  function handleToggleInvite() {
    setShowInvite((open) => {
      if (open) {
        resetInviteForm()
      }
      return !open
    })
    setError(null)
  }

  function handleGeneratePassword() {
    setPassword(generatePassword())
    setPasswordRevealed(true)
    setError(null)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!companyId) {
      setError(t('users.errSelectCompany'))
      return
    }
    if (!isValidPassword(password)) {
      setError(t('auth.passwordPolicyError'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createUser({
        email,
        password,
        companyId,
        status: 'invited',
      })
      resetInviteForm()
      setShowInvite(false)
      setMessage(t('users.msgInvited'))
      await loadUsers()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errCreate'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(user: IdentityUser) {
    const nextStatus: UserStatus = user.status === 'disabled' ? 'active' : 'disabled'
    setError(null)
    setMessage(null)
    setStatusUpdatingId(user.id)
    try {
      const updated = await updateUser(user.id, { status: nextStatus })
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errUpdate'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  function requestDelete(user: IdentityUser) {
    if (sessionUser?.id === user.id) {
      setError(t('users.deleteSelf'))
      return
    }
    setError(null)
    setPendingDelete(user)
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return
    }
    setError(null)
    setMessage(null)
    setDeletingId(pendingDelete.id)
    try {
      await deleteUser(pendingDelete.id)
      setUsers((current) => current.filter((item) => item.id !== pendingDelete.id))
      setPendingDelete(null)
      setMessage(t('users.msgDeleted'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('users.errDelete'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="identity-page">
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      <section className="identity-panel identity-panel--directory">
        <div className="identity-panel__head">
          <div className="identity-panel__head-tools">
            <div className="identity-search">
              <span className="identity-search__icon" aria-hidden>
                <IconSearch />
              </span>
              <TextField
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('users.searchPlaceholder')}
                aria-label={t('users.searchAria')}
              />
            </div>
            <SidebarSelect
              id="directory-status"
              label={t('users.filterStatus')}
              value={statusFilter}
              options={STATUS_FILTERS.map((value) => ({ value, label: statusLabel(value) }))}
              onChange={setStatusFilter}
            />
            <SidebarSelect
              id="directory-signin"
              label={t('users.filterSignInMethod')}
              value={signInFilter}
              options={SIGN_IN_FILTERS.map((value) => ({ value, label: signInLabel(value) }))}
              onChange={setSignInFilter}
            />
            <SidebarSelect
              id="directory-mfa"
              label={t('users.filterMfa')}
              value={mfaFilter}
              options={MFA_FILTERS.map((value) => ({ value, label: mfaLabel(value) }))}
              onChange={setMfaFilter}
            />
            <Button
              variant={showInvite ? 'secondary' : 'primary'}
              onClick={handleToggleInvite}
            >
              {showInvite ? t('users.cancel') : t('users.inviteUser')}
            </Button>
          </div>
        </div>

        {showInvite ? (
          <form className="identity-invite" onSubmit={(event) => void handleCreate(event)}>
            <div className="identity-invite__header">
              <h3>{t('users.inviteTitle')}</h3>
              <p>{t('users.inviteHint')}</p>
            </div>
            <div className="identity-invite__grid">
              <FormField label={t('users.fieldEmail')} htmlFor="user-email">
                <TextField
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={isSubmitting}
                  autoComplete="off"
                />
              </FormField>
              <FormField label={t('users.fieldCompany')} htmlFor="user-company">
                <SidebarSelect
                  id="user-company"
                  label={t('users.fieldCompany')}
                  hideLabel
                  value={companyId}
                  options={
                    companies.length === 0
                      ? [{ value: '', label: t('users.noActiveCompanies') }]
                      : companies.map((company) => ({ value: company.id, label: company.name }))
                  }
                  onChange={setCompanyId}
                  disabled={isSubmitting || companies.length === 0}
                />
              </FormField>
              <FormField label={t('users.fieldPassword')} htmlFor="user-password">
                <div className="identity-invite__password">
                  <PasswordField
                    id="user-password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    placeholder={t('auth.passwordCreatePlaceholder')}
                    showRequirements
                    disabled={isSubmitting}
                    revealed={passwordRevealed}
                    onRevealedChange={setPasswordRevealed}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleGeneratePassword}
                    disabled={isSubmitting}
                  >
                    Generate
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t('users.saving') : t('users.invite')}
                  </Button>
                </div>
              </FormField>
            </div>
          </form>
        ) : null}

        {isLoading ? <p className="identity-empty">{t('users.loading')}</p> : null}
        {!isLoading && users.length === 0 ? <p className="identity-empty">{t('users.empty')}</p> : null}
        {!isLoading && users.length > 0 && filteredUsers.length === 0 ? (
          <p className="identity-empty">{t('users.emptyFiltered')}</p>
        ) : null}
        {filteredUsers.length > 0 ? (
          <div className="identity-table-wrap">
            <table className="identity-table identity-table--packed identity-table--users">
              <thead>
                <tr>
                  <th>{t('users.colName')}</th>
                  <th>{t('users.colEmail')}</th>
                  <th className="identity-table__status">{t('users.colStatus')}</th>
                  <th>{t('users.colSignIn')}</th>
                  <th>{t('users.colMfa')}</th>
                  <th>{t('users.colLastActive')}</th>
                  <th className="identity-table__actions">{t('users.colActions')}</th>
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
                        <span className="identity-table__flag">Incomplete</span>
                      ) : null}
                    </td>
                    <td>{user.email}</td>
                    <td className="identity-table__status">
                      <span className={`identity-status identity-status--${user.status}`}>
                        {formatStatusLabel(user.status, t)}
                      </span>
                    </td>
                    <td>{formatSignInMethod(user.signInMethod, t)}</td>
                    <td>{formatDirectoryMfa(user, t)}</td>
                    <td>{formatLastActive(user.lastActiveAt, t)}</td>
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions">
                        <IconButton
                          label={t('users.actionView')}
                          onClick={() => navigate(`/system/core/users/${user.id}`)}
                        >
                          <IconEye />
                        </IconButton>
                        <IconButton
                          label={t('users.actionEdit')}
                          onClick={() => navigate(`/system/core/users/${user.id}?edit=1`)}
                        >
                          <IconPencil />
                        </IconButton>
                        {user.signInMethod ? (
                          <IconButton
                            label={user.mfaEnabled ? t('users.actionResetMfa') : t('users.actionRequireMfa')}
                            onClick={() =>
                              navigate(
                                `/mfa/setup?userId=${user.id}&mode=${user.mfaEnabled ? 'reset' : 'require'}`,
                              )
                            }
                          >
                            {user.mfaEnabled ? <IconShieldOff /> : <IconShield />}
                          </IconButton>
                        ) : null}
                        <IconButton
                          label={user.status === 'active' ? t('users.statusActive') : t('users.statusInactive')}
                          onClick={() => void handleToggleStatus(user)}
                          disabled={statusUpdatingId === user.id}
                        >
                          {user.status === 'active' ? <IconCircleCheck /> : <IconBan />}
                        </IconButton>
                        <IconButton
                          label={sessionUser?.id === user.id ? t('users.deleteSelf') : t('users.actionDelete')}
                          variant="danger"
                          onClick={() => requestDelete(user)}
                          disabled={deletingId === user.id || sessionUser?.id === user.id}
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
        ) : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('users.deleteTitle')}
        description={
          pendingDelete ? (
            <>
              This will permanently remove{' '}
              <strong>
                {pendingDelete.displayName} ({pendingDelete.email})
              </strong>{' '}
              and their memberships.
            </>
          ) : null
        }
        confirmLabel={t('users.deleteConfirm')}
        busy={Boolean(deletingId)}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deletingId) {
            setPendingDelete(null)
          }
        }}
      />
    </div>
  )
}
