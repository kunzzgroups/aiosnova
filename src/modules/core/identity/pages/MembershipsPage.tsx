import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { ApiError } from '@/services/httpClient'
import type {
  CompanyOption,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
} from '@/modules/core/identity/types/identity'
import { formatStatusLabel } from '@/modules/core/identity/types/identity'
import {
  createMembership,
  fetchIdentityMeta,
  fetchMemberships,
  fetchOrganizations,
  fetchPositions,
  fetchUsers,
  updateMembership,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

export function MembershipsPage() {
  const [memberships, setMemberships] = useState<MembershipRecord[]>([])
  const [users, setUsers] = useState<IdentityUser[]>([])
  const [organizations, setOrganizations] = useState<OrganizationNode[]>([])
  const [positions, setPositions] = useState<PositionRecord[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [userId, setUserId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [isPrimary, setIsPrimary] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const orgMap = useMemo(
    () => new Map(organizations.map((org) => [org.id, org])),
    [organizations],
  )
  const positionMap = useMemo(
    () => new Map(positions.map((position) => [position.id, position])),
    [positions],
  )
  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [meta, usersResult, orgsResult, positionsResult, membershipsResult] = await Promise.all([
        fetchIdentityMeta(),
        fetchUsers(),
        fetchOrganizations(),
        fetchPositions(),
        fetchMemberships(),
      ])
      setCompanies(meta.companies)
      setUsers(usersResult.items)
      setOrganizations(orgsResult.items)
      setPositions(positionsResult.items)
      setMemberships(membershipsResult.items)
      setUserId((current) => current || usersResult.items[0]?.id || '')
      setCompanyId((current) => current || meta.companies[0]?.id || '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load memberships.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createMembership({
        userId,
        companyId: companyId || null,
        organizationId: organizationId || null,
        positionId: positionId || null,
        isPrimary,
      })
      setMessage('Membership created.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create membership.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleEnd(membership: MembershipRecord) {
    try {
      await updateMembership(membership.id, { status: 'ended' })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to end membership.')
    }
  }

  async function handleMakePrimary(membership: MembershipRecord) {
    try {
      await updateMembership(membership.id, { isPrimary: true })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update membership.')
    }
  }

  return (
    <div className="identity-page">
        <header className="identity-page__header">
          <h1>Membership</h1>
          <p>
            User relationships to Tenant / Company / Organization / Position (Layer 1 · 06). Not
            permissions.
          </p>
        </header>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}

        <section className="identity-panel">
          <h2>Add membership</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="User" htmlFor="mem-user">
              <select
                id="mem-user"
                className="identity-select"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
                disabled={isSubmitting}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.email})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Company" htmlFor="mem-company">
              <select
                id="mem-company"
                className="identity-select"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Organization" htmlFor="mem-org">
              <select
                id="mem-org"
                className="identity-select"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Position" htmlFor="mem-pos">
              <select
                id="mem-pos"
                className="identity-select"
                value={positionId}
                onChange={(event) => setPositionId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">None</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Primary" htmlFor="mem-primary">
              <select
                id="mem-primary"
                className="identity-select"
                value={isPrimary ? 'yes' : 'no'}
                onChange={(event) => setIsPrimary(event.target.value === 'yes')}
                disabled={isSubmitting}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSubmitting || !userId}>
                {isSubmitting ? 'Saving…' : 'Add'}
              </Button>
            </div>
          </form>
        </section>

        <section className="identity-panel">
          <h2>Active & historical</h2>
          {isLoading ? <p className="identity-empty">Loading…</p> : null}
          {memberships.length > 0 ? (
            <div className="identity-table-wrap">
              <table className="identity-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Company</th>
                    <th>Organization</th>
                    <th>Position</th>
                    <th>Primary</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => (
                    <tr key={membership.id}>
                      <td>{userMap.get(membership.userId)?.displayName ?? membership.userId}</td>
                      <td>
                        {membership.companyId
                          ? (companyMap.get(membership.companyId)?.name ?? membership.companyId)
                          : '—'}
                      </td>
                      <td>
                        {membership.organizationId
                          ? (orgMap.get(membership.organizationId)?.name ?? membership.organizationId)
                          : '—'}
                      </td>
                      <td>
                        {membership.positionId
                          ? (positionMap.get(membership.positionId)?.name ?? membership.positionId)
                          : '—'}
                      </td>
                      <td>{membership.isPrimary ? 'Yes' : 'No'}</td>
                      <td>
                        <span className={`identity-status identity-status--${membership.status}`}>
                          {formatStatusLabel(membership.status)}
                        </span>
                      </td>
                      <td>
                        <div className="identity-inline-actions">
                          {membership.status === 'active' && !membership.isPrimary ? (
                            <Button
                              variant="secondary"
                              size="md"
                              onClick={() => void handleMakePrimary(membership)}
                            >
                              Make primary
                            </Button>
                          ) : null}
                          {membership.status === 'active' ? (
                            <Button
                              variant="secondary"
                              size="md"
                              onClick={() => void handleEnd(membership)}
                            >
                              End
                            </Button>
                          ) : null}
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
