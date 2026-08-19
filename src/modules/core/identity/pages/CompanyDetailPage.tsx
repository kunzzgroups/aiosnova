import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { IconBan, IconCircleCheck } from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import { formatStatusLabel } from '@/modules/core/identity/types/identity'
import {
  fetchCompany,
  updateCompany,
  type CompanyListItem,
  type CompanyMember,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function CompanyDetailPage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [company, setCompany] = useState<CompanyListItem | null>(null)
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [name, setName] = useState('')
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === '1')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadCompany = useCallback(async () => {
    if (!companyId) {
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchCompany(companyId)
      setCompany(result.company)
      setMembers(result.members)
      setName(result.company.name)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load company.')
    } finally {
      setIsLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void loadCompany()
  }, [loadCompany])

  useEffect(() => {
    if (!message) {
      return
    }
    const timeoutId = window.setTimeout(() => setMessage(null), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!company) {
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateCompany(company.id, { name })
      setCompany(updated)
      setIsEditing(false)
      setMessage('Company updated.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update company.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleStatus() {
    if (!company) {
      return
    }
    const nextStatus = company.status === 'inactive' ? 'active' : 'inactive'
    setError(null)
    setMessage(null)
    try {
      const updated = await updateCompany(company.id, { status: nextStatus })
      setCompany(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update company.')
    }
  }

  if (isLoading) {
    return (
      <div className="identity-page">
        <p className="identity-empty">Loading…</p>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="identity-page">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button variant="secondary" onClick={() => navigate('/system/core/companies')}>
          Back to companies
        </Button>
      </div>
    )
  }

  return (
    <div className="identity-page">
      <header className="identity-page__header identity-page__header--row identity-page__header--toolbar">
        <nav className="identity-breadcrumb" aria-label="Breadcrumb">
          <Link to="/system/core/companies">Companies</Link>
          <span aria-hidden="true"> / </span>
          <h1>{company.name}</h1>
        </nav>
        <Button variant="ghost" onClick={() => navigate('/system/core/companies')}>
          Back
        </Button>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <section className="identity-panel">
        <div className="identity-panel__title-row">
          <h2>Company</h2>
          <div className="identity-inline-actions">
            {!isEditing ? (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : null}
            <IconButton
              label={company.status === 'active' ? 'Active' : 'Inactive'}
              variant={company.status === 'active' ? 'secondary' : 'danger'}
              onClick={() => void handleToggleStatus()}
            >
              {company.status === 'active' ? <IconCircleCheck /> : <IconBan />}
            </IconButton>
          </div>
        </div>

        {isEditing ? (
          <form className="identity-form identity-form--stack" onSubmit={(event) => void handleSave(event)}>
            <FormField label="Code" htmlFor="detail-company-code">
              <TextField id="detail-company-code" value={company.code} readOnly />
            </FormField>
            <FormField label="Name" htmlFor="detail-company-name">
              <TextField
                id="detail-company-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={isSaving}
              />
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false)
                  setName(company.name)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="identity-profile-tiles">
            <div className="identity-profile-tile">
              <span>Code</span>
              <strong>{company.code}</strong>
            </div>
            <div className="identity-profile-tile">
              <span>Status</span>
              <strong>{formatStatusLabel(company.status)}</strong>
            </div>
            <div className="identity-profile-tile">
              <span>Members</span>
              <strong>{company.memberCount}</strong>
            </div>
            <div className="identity-profile-tile">
              <span>Tenant</span>
              <strong>{company.tenantId}</strong>
            </div>
          </div>
        )}
      </section>

      <section className="identity-panel">
        <h2>Members</h2>
        {members.length === 0 ? (
          <p className="identity-empty">No members in this company yet. Invite a user and select this company.</p>
        ) : (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>User status</th>
                  <th>Membership</th>
                  <th>Organization</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membershipId}>
                    <td>
                      <Link className="identity-text-link" to={`/system/core/users/${member.userId}`}>
                        {member.displayName}
                      </Link>
                      {member.isPrimary ? (
                        <span className="identity-status identity-status--active identity-status--inline">
                          Primary
                        </span>
                      ) : null}
                    </td>
                    <td>{member.email}</td>
                    <td>
                      <span className={`identity-status identity-status--${member.userStatus}`}>
                        {formatStatusLabel(member.userStatus)}
                      </span>
                    </td>
                    <td>
                      <span className={`identity-status identity-status--${member.status}`}>
                        {formatStatusLabel(member.status)}
                      </span>
                    </td>
                    <td>{member.organizationName ?? '—'}</td>
                    <td>{member.positionName ?? '—'}</td>
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
