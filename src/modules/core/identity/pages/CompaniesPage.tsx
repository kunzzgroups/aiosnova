import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconBan, IconCircleCheck, IconEye, IconPencil } from '@/components/icons/Icons'
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

const STATUS_FILTERS = ['all', 'active', 'inactive'] as const

function matchesSearch(company: CompanyListItem, query: string) {
  if (!query) {
    return true
  }
  const haystack = `${company.name} ${company.code}`.toLowerCase()
  return haystack.includes(query)
}

export function CompaniesPage() {
  const { t } = useTranslation()
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
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)

  const loadCompanies = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true)
    }
    setError(null)
    try {
      const result = await fetchCompanies()
      setCompanies(result.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('org.errLoadCompanies'))
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
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
      const created = await createCompany({ code, name })
      resetCreateForm()
      setShowCreate(false)
      setMessage(t('org.msgCompanyCreated'))
      setCompanies((current) => [...current, created])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('org.errCreateCompany'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(company: CompanyRecord) {
    const nextStatus = company.status === 'inactive' ? 'active' : 'inactive'
    setError(null)
    setMessage(null)
    setStatusUpdatingId(company.id)
    try {
      const updated = await updateCompany(company.id, { status: nextStatus })
      setCompanies((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('org.errUpdateCompany'))
    } finally {
      setStatusUpdatingId(null)
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

      <section className="identity-panel">
        <h2>{t('org.companies.directory')}</h2>
        <div className="identity-directory-toolbar">
          <TextField
            className="identity-directory-toolbar__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('org.companies.searchPlaceholder')}
            aria-label={t('org.companies.searchAria')}
          />
          <div className="identity-directory-toolbar__filters">
            <SidebarSelect
              id="company-status"
              label={t('org.fieldStatus')}
              value={statusFilter}
              options={STATUS_FILTERS.map((value) => ({
                value,
                label:
                  value === 'all'
                    ? t('users.filterAll')
                    : value === 'active'
                      ? t('users.statusActive')
                      : t('users.statusInactive'),
              }))}
              onChange={setStatusFilter}
            />
          </div>
          <div className="identity-directory-toolbar__invite">
            <Button variant={showCreate ? 'secondary' : 'primary'} onClick={handleToggleCreate}>
              {showCreate ? t('users.cancel') : t('org.companies.newCompany')}
            </Button>
          </div>
        </div>

        {showCreate ? (
          <form className="identity-invite" onSubmit={(event) => void handleCreate(event)}>
            <div className="identity-invite__header">
              <h3>{t('org.companies.newTitle')}</h3>
              <p>{t('org.companies.newHint')}</p>
            </div>
            <div className="identity-invite__grid">
              <FormField label={t('org.fieldCode')} htmlFor="company-code">
                <TextField
                  id="company-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t('org.companies.codePlaceholder')}
                  required
                  disabled={isSubmitting}
                />
              </FormField>
              <FormField label={t('org.fieldName')} htmlFor="company-name">
                <div className="identity-invite__password">
                  <TextField
                    id="company-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('org.companies.namePlaceholder')}
                    required
                    disabled={isSubmitting}
                  />
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t('users.saving') : t('org.companies.create')}
                  </Button>
                </div>
              </FormField>
            </div>
          </form>
        ) : null}

        {isLoading ? <p className="identity-empty">{t('users.loading')}</p> : null}
        {!isLoading && companies.length === 0 ? (
          <p className="identity-empty">{t('org.companies.empty')}</p>
        ) : null}
        {!isLoading && companies.length > 0 && filteredCompanies.length === 0 ? (
          <p className="identity-empty">{t('org.companies.emptyFiltered')}</p>
        ) : null}
        {filteredCompanies.length > 0 ? (
          <div className="identity-table-wrap">
            <table className="identity-table identity-table--packed">
              <thead>
                <tr>
                  <th>{t('org.colName')}</th>
                  <th>{t('org.colCode')}</th>
                  <th className="identity-table__status">{t('org.fieldStatus')}</th>
                  <th>{t('org.colMembers')}</th>
                  <th className="identity-table__spacer" aria-hidden="true" />
                  <th className="identity-table__actions">{t('users.colActions')}</th>
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
                    <td className="identity-table__status">
                      <span className={`identity-status identity-status--${company.status}`}>
                        {formatStatusLabel(company.status, t)}
                      </span>
                    </td>
                    <td>{company.memberCount}</td>
                    <td className="identity-table__spacer" aria-hidden="true" />
                    <td className="identity-table__actions">
                      <div className="identity-inline-actions">
                        <IconButton
                          label={t('users.actionView')}
                          onClick={() => navigate(`/system/core/companies/${company.id}`)}
                        >
                          <IconEye />
                        </IconButton>
                        <IconButton
                          label={t('users.actionEdit')}
                          onClick={() => navigate(`/system/core/companies/${company.id}?edit=1`)}
                        >
                          <IconPencil />
                        </IconButton>
                        <IconButton
                          label={company.status === 'active' ? t('users.statusActive') : t('users.statusInactive')}
                          variant={company.status === 'active' ? 'secondary' : 'danger'}
                          onClick={() => void handleToggleStatus(company)}
                          disabled={statusUpdatingId === company.id}
                        >
                          {company.status === 'active' ? <IconCircleCheck /> : <IconBan />}
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
    </div>
  )
}
