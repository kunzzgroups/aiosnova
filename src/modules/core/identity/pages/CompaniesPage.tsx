import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { ApiError } from '@/services/httpClient'
import { formatStatusLabel } from '@/modules/core/identity/types/identity'
import type { CompanyRecord } from '@/modules/core/identity/types/identity'
import {
  createCompany,
  fetchCompanies,
  updateCompany,
  type CompanyListItem,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const

function matchesSearch(company: CompanyListItem, query: string) {
  if (!query) {
    return true
  }
  const haystack = `${company.name} ${company.code}`.toLowerCase()
  return haystack.includes(query)
}

export function CompaniesPage() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadCompanies = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchCompanies()
      setCompanies(result.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load companies.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    if (!message) {
      return
    }
    const timeoutId = window.setTimeout(() => setMessage(null), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return companies.filter((company) => {
      if (!matchesSearch(company, normalizedQuery)) {
        return false
      }
      if (statusFilter !== 'all' && company.status !== statusFilter) {
        return false
      }
      return true
    })
  }, [companies, query, statusFilter])

  function resetCreateForm() {
    setCode('')
    setName('')
  }

  function handleToggleCreate() {
    setShowCreate((open) => {
      if (open) {
        resetCreateForm()
      }
      return !open
    })
    setError(null)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createCompany({ code, name })
      resetCreateForm()
      setShowCreate(false)
      setMessage('Company created.')
      await loadCompanies()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create company.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(company: CompanyRecord) {
    const nextStatus = company.status === 'inactive' ? 'active' : 'inactive'
    setError(null)
    setMessage(null)
    try {
      await updateCompany(company.id, { status: nextStatus })
      await loadCompanies()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update company.')
    }
  }

  return (
    <div className="identity-page">
      <header className="identity-page__header">
        <h1>Companies</h1>
        <p>Tenant / Company — legal entities and workspaces (Layer 0).</p>
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
            placeholder="Search name or code..."
            aria-label="Search name or code"
          />
          <div className="identity-directory-toolbar__filters">
            <SidebarSelect
              id="company-status"
              label="Status"
              value={statusFilter}
              options={[...STATUS_FILTERS]}
              onChange={setStatusFilter}
            />
          </div>
          <div className="identity-directory-toolbar__invite">
            <Button variant={showCreate ? 'secondary' : 'primary'} onClick={handleToggleCreate}>
              {showCreate ? 'Cancel' : 'New Company'}
            </Button>
          </div>
        </div>

        {showCreate ? (
          <form className="identity-invite" onSubmit={(event) => void handleCreate(event)}>
            <div className="identity-invite__header">
              <h3>New company</h3>
              <p>Create a legal entity in the current tenant. People join it through membership.</p>
            </div>
            <div className="identity-invite__grid">
              <FormField label="Code" htmlFor="company-code">
                <TextField
                  id="company-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="RETAIL"
                  required
                  disabled={isSubmitting}
                />
              </FormField>
              <FormField label="Name" htmlFor="company-name">
                <div className="identity-invite__password">
                  <TextField
                    id="company-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Enter company name"
                    required
                    disabled={isSubmitting}
                  />
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Create'}
                  </Button>
                </div>
              </FormField>
            </div>
          </form>
        ) : null}

        {isLoading ? <p className="identity-empty">Loading…</p> : null}
        {!isLoading && companies.length === 0 ? <p className="identity-empty">No companies yet.</p> : null}
        {!isLoading && companies.length > 0 && filteredCompanies.length === 0 ? (
          <p className="identity-empty">No companies match these filters.</p>
        ) : null}
        {filteredCompanies.length > 0 ? (
          <div className="identity-table-wrap">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th className="identity-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <Link className="identity-text-link" to={`/system/core/companies/${company.id}`}>
                        {company.name}
                      </Link>
                    </td>
                    <td>{company.code}</td>
                    <td>
                      <span className={`identity-status identity-status--${company.status}`}>
                        {formatStatusLabel(company.status)}
                      </span>
                    </td>
                    <td>{company.memberCount}</td>
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions">
                        <Button
                          variant="secondary"
                          size="md"
                          className="identity-action-btn identity-action-btn--view"
                          onClick={() => navigate(`/system/core/companies/${company.id}`)}
                        >
                          View
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          className="identity-action-btn identity-action-btn--edit"
                          onClick={() => navigate(`/system/core/companies/${company.id}?edit=1`)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          className="identity-action-btn identity-action-btn--status"
                          onClick={() => void handleToggleStatus(company)}
                        >
                          {company.status === 'inactive' ? 'Activate' : 'Disable'}
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
