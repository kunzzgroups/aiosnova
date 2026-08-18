import { apiRequest } from '@/services/httpClient'
import type {
  CompanyOption,
  IdentityProfilePayload,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
} from '@/modules/core/identity/types/identity'

export async function fetchIdentityMeta() {
  return apiRequest<{ tenantId: string; companies: CompanyOption[] }>('/api/identity/meta', {
    auth: true,
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

export async function createUser(payload: {
  email: string
  password: string
  status?: IdentityUser['status']
}) {
  return apiRequest<IdentityUser>('/api/identity/users', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export async function updateUser(id: string, payload: IdentityProfilePayload) {
  return apiRequest<IdentityUser>(`/api/identity/users/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function sendUserPasswordReset(id: string) {
  return apiRequest<{ message: string; demoHint?: string }>(
    `/api/identity/users/${id}/password-reset`,
    {
      method: 'POST',
      auth: true,
    },
  )
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

export async function fetchOrganizations() {
  return apiRequest<{ items: OrganizationNode[] }>('/api/identity/organizations', { auth: true })
}

export async function createOrganization(payload: {
  parentId?: string | null
  code: string
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
  payload: Partial<Pick<OrganizationNode, 'name' | 'status' | 'parentId' | 'type'>>,
) {
  return apiRequest<OrganizationNode>(`/api/identity/organizations/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

export async function fetchPositions() {
  return apiRequest<{ items: PositionRecord[] }>('/api/identity/positions', { auth: true })
}

export async function createPosition(payload: {
  code: string
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
  payload: Partial<Pick<PositionRecord, 'name' | 'description' | 'status'>>,
) {
  return apiRequest<PositionRecord>(`/api/identity/positions/${id}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
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
