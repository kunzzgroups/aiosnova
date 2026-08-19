import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconBan, IconStar } from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import type {
  CompanyRecord,
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
  const [companies, setCompanies] = useState<CompanyRecord[]>([])
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
  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.displayName} (${user.email})` })),
    [users],
  )
  const companyOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...companies.map((company) => ({ value: company.id, label: company.name })),
    ],
    [companies],
  )
  const organizationOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...organizations.map((org) => ({ value: org.id, label: org.name })),
    ],
    [organizations],
  )
  const positionOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...positions.map((position) => ({ value: position.id, label: position.name })),
    ],
    [positions],
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

        <FlashToasts
          error={error}
          message={message}
          onClearError={() => setError(null)}
          onClearMessage={() => setMessage(null)}
        />

        <section className="identity-panel">
          <h2>Add membership</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="User" htmlFor="mem-user">
              <SidebarSelect
                id="mem-user"
                label="User"
                hideLabel
                value={userId}
                options={userOptions}
                onChange={setUserId}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Company" htmlFor="mem-company">
              <SidebarSelect
                id="mem-company"
                label="Company"
                hideLabel
                value={companyId}
                options={companyOptions}
                onChange={setCompanyId}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Organization" htmlFor="mem-org">
              <SidebarSelect
                id="mem-org"
                label="Organization"
                hideLabel
                value={organizationId}
                options={organizationOptions}
                onChange={setOrganizationId}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Position" htmlFor="mem-pos">
              <SidebarSelect
                id="mem-pos"
                label="Position"
                hideLabel
                value={positionId}
                options={positionOptions}
                onChange={setPositionId}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Primary" htmlFor="mem-primary">
              <SidebarSelect
                id="mem-primary"
                label="Primary"
                hideLabel
                value={isPrimary ? 'yes' : 'no'}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
                onChange={(value) => setIsPrimary(value === 'yes')}
                disabled={isSubmitting}
              />
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
                    <th className="identity-table__actions">Actions</th>
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
                      <td className="identity-table__actions">
                        <div className="identity-inline-actions">
                          {membership.status === 'active' && !membership.isPrimary ? (
                            <IconButton
                              label="Make primary"
                              onClick={() => void handleMakePrimary(membership)}
                            >
                              <IconStar />
                            </IconButton>
                          ) : null}
                          {membership.status === 'active' ? (
                            <IconButton
                              label="End membership"
                              variant="danger"
                              onClick={() => void handleEnd(membership)}
                            >
                              <IconBan />
                            </IconButton>
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
