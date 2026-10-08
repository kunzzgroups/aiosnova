import { apiRequest } from '@/services/httpClient'
import type {
  InvitationPayload,
  InvitationOptions,
  CompanyOption,
  CompanyRecord,
  IdentityProfilePayload,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
} from '@/modules/core/identity/types/identity'

export async function fetchIdentityMeta() {
  return apiRequest<{ merchantId: string; companies: CompanyOption[] }>('/api/identity/meta', {
    auth: true,
  })
}

export type CompanyListItem = CompanyRecord & { memberCount: number }

export type CompanyMember = {
  membershipId: string
  userId: string
  displayName: string
  email: string
  userStatus: IdentityUser['status']
  isPrimary: boolean
  status: MembershipRecord['status']
  organizationName: string | null
  positionName: string | null
}

export async function fetchCompanies() {
  return apiRequest<{ items: CompanyListItem[] }>('/api/identity/companies', { auth: true })
}

export async function fetchCompany(id: string) {
  return apiRequest<{ company: CompanyListItem; members: CompanyMember[] }>(
    `/api/identity/companies/${id}`,
    { auth: true },
  )
}

export async function createCompany(payload: { code: string; name: string }) {
  return apiRequest<CompanyListItem>('/api/identity/companies', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateCompany(
  id: string,
  payload: Partial<Pick<CompanyRecord, 'name' | 'status'>>,
) {
  return apiRequest<CompanyListItem>(`/api/identity/companies/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export type MembershipWithLabels = MembershipRecord & {
  companyName: string | null
  organizationName: string | null
  positionName: string | null
}

export async function fetchUsers() {
  return apiRequest<{ items: IdentityUser[] }>('/api/identity/users', { auth: true })
}

export async function fetchUser(id: string) {
  return apiRequest<{ user: IdentityUser; memberships: MembershipWithLabels[] }>(
    `/api/identity/users/${id}`,
    { auth: true },
  )
}

export async function fetchInvitationOptions() {
  return apiRequest<InvitationOptions>('/api/identity/invitation-options', { auth: true })
}

export async function createUser(payload: InvitationPayload) {
  return apiRequest<IdentityUser>('/api/identity/users', { method: 'POST', auth: true, body: payload })
}

export async function updateUser(id: string, payload: IdentityProfilePayload) {
  return apiRequest<IdentityUser>(`/api/identity/users/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function deleteUser(id: string) {
  return apiRequest<void>(`/api/identity/users/${id}`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function disableUserMfa(id: string, code: string) {
  return apiRequest<{ user: IdentityUser; message: string }>(`/api/identity/users/${id}/mfa/disable`, {
    method: 'POST',
    auth: true,
    body: { code },
  })
}

export async function enableUserMfa(id: string, code: string) {
  return apiRequest<{ user: IdentityUser; message: string }>(`/api/identity/users/${id}/mfa/enable`, {
    method: 'POST',
    auth: true,
    body: { code },
  })
}

export async function changeOwnPassword(payload: {
  currentPassword: string
  newPassword: string
}) {
  return apiRequest<{ message: string }>('/api/auth/password/change', {
    method: 'POST',
    auth: true,
    csrf: true,
    body: payload,
  })
}

export async function fetchOrganizations(companyId?: string) {
  return apiRequest<{ items: OrganizationNode[] }>('/api/identity/organizations'+(companyId ? '?companyId='+encodeURIComponent(companyId) : ''), { auth: true })
}

export async function createOrganization(payload: {
  managerPositionId?: string | null
  status?: OrganizationNode['status']
  companyId?: string
  parentId?: string | null
  code?: string
  name: string
  type?: OrganizationNode['type']
}) {
  return apiRequest<OrganizationNode>('/api/identity/organizations', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateOrganization(
  id: string,
  payload: Partial<Pick<OrganizationNode, 'name' | 'status' | 'parentId' | 'type' | 'managerPositionId'>>,
) {
  return apiRequest<OrganizationNode>(`/api/identity/organizations/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function deleteOrganization(id: string) {
  return apiRequest<void>(`/api/identity/organizations/${id}`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function fetchPositions(companyId?: string) {
  return apiRequest<{ items: PositionRecord[] }>('/api/identity/positions'+(companyId ? '?companyId='+encodeURIComponent(companyId) : ''), { auth: true })
}

export async function createPosition(payload: {
  companyId?: string
  organizationId?: string | null
  code?: string
  name: string
  description?: string
}) {
  return apiRequest<PositionRecord>('/api/identity/positions', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updatePosition(
  id: string,
  payload: Partial<Pick<PositionRecord, 'name' | 'description' | 'status' | 'organizationId'>>,
) {
  return apiRequest<PositionRecord>(`/api/identity/positions/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function deletePosition(id: string) {
  return apiRequest<void>(`/api/identity/positions/${id}`, { method:'DELETE',auth:true })
}

export async function fetchMemberships() {
  return apiRequest<{ items: MembershipRecord[] }>('/api/identity/memberships', { auth: true })
}

export async function createMembership(payload: {
  userId: string
  companyId?: string | null
  organizationId?: string | null
  positionId?: string | null
  isPrimary?: boolean
  validFrom?: string
}) {
  return apiRequest<MembershipRecord>('/api/identity/memberships', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateMembership(
  id: string,
  payload: Partial<Pick<MembershipRecord, 'status' | 'isPrimary' | 'validTo'>>,
) {
  return apiRequest<MembershipRecord>(`/api/identity/memberships/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function updateInvitation(id: string, payload: InvitationPayload) {
  return apiRequest<IdentityUser>(`/api/identity/users/${id}/invitation`, {
    method: 'PATCH', auth: true, body: payload,
  })
}
