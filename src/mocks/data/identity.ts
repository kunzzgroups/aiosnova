import type {
  CompanyOption,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
  UserStatus,
} from '@/modules/core/identity/types/identity'

export const DEMO_TENANT_ID = 'tenant-acme'

const emptyProfile = {
  fullName: '',
  phone: '',
  avatarUrl: '',
  language: 'en',
  timezone: 'Asia/Kuala_Lumpur',
}

export const identityCompanies: CompanyOption[] = [
  { id: 'company-retail', name: 'Acme Retail', tenantId: DEMO_TENANT_ID },
  { id: 'company-wholesale', name: 'Acme Wholesale', tenantId: DEMO_TENANT_ID },
]

export const identityUsers: IdentityUser[] = [
  {
    id: 'user-demo',
    email: 'demo@aios.dev',
    displayName: 'Demo User',
    fullName: 'Demo User',
    phone: '+60 12-345 0001',
    avatarUrl: '',
    language: 'en',
    timezone: 'Asia/Kuala_Lumpur',
    status: 'active',
    mfaEnabled: false,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'user-mfa',
    email: 'mfa@aios.dev',
    displayName: 'MFA User',
    fullName: 'MFA User',
    phone: '+60 12-345 0002',
    avatarUrl: '',
    language: 'en',
    timezone: 'Asia/Kuala_Lumpur',
    status: 'active',
    mfaEnabled: true,
    createdAt: '2026-01-12T08:00:00.000Z',
  },
  {
    id: 'user-ops',
    email: 'ops.lead@aios.dev',
    displayName: 'Ops Lead',
    fullName: 'Alex Tan',
    phone: '+60 12-345 0003',
    avatarUrl: '',
    language: 'en',
    timezone: 'Asia/Kuala_Lumpur',
    status: 'active',
    mfaEnabled: false,
    createdAt: '2026-02-01T08:00:00.000Z',
  },
  {
    id: 'user-invited',
    email: 'newhire@aios.dev',
    displayName: 'New Hire',
    ...emptyProfile,
    status: 'invited',
    mfaEnabled: false,
    createdAt: '2026-08-01T08:00:00.000Z',
  },
]

export function upsertIdentityUser(input: {
  id: string
  email: string
  displayName: string
  status?: UserStatus
  mfaEnabled?: boolean
}): IdentityUser {
  const email = input.email.trim().toLowerCase()
  const existing = identityUsers.find((user) => user.id === input.id || user.email === email)
  if (existing) {
    return existing
  }

  const user: IdentityUser = {
    id: input.id,
    email,
    displayName: input.displayName.trim() || email,
    ...emptyProfile,
    status: input.status ?? 'active',
    mfaEnabled: input.mfaEnabled ?? false,
    createdAt: new Date().toISOString(),
  }

  identityUsers.push(user)
  return user
}

export function setIdentityUserMfaEnabled(userId: string, mfaEnabled: boolean) {
  const user = identityUsers.find((item) => item.id === userId)
  if (user) {
    user.mfaEnabled = mfaEnabled
  }
}

export const identityOrganizations: OrganizationNode[] = [
  {
    id: 'org-hq',
    tenantId: DEMO_TENANT_ID,
    parentId: null,
    code: 'HQ',
    name: 'Acme Headquarters',
    type: 'division',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-retail',
    tenantId: DEMO_TENANT_ID,
    parentId: 'org-hq',
    code: 'RET',
    name: 'Retail Division',
    type: 'division',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-sales',
    tenantId: DEMO_TENANT_ID,
    parentId: 'org-retail',
    code: 'SAL',
    name: 'Sales Department',
    type: 'department',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-ops',
    tenantId: DEMO_TENANT_ID,
    parentId: 'org-hq',
    code: 'OPS',
    name: 'Operations',
    type: 'department',
    status: 'active',
    sortOrder: 2,
  },
  {
    id: 'org-finance',
    tenantId: DEMO_TENANT_ID,
    parentId: 'org-hq',
    code: 'FIN',
    name: 'Finance',
    type: 'department',
    status: 'active',
    sortOrder: 3,
  },
]

export const identityPositions: PositionRecord[] = [
  {
    id: 'pos-ceo',
    tenantId: DEMO_TENANT_ID,
    code: 'CEO',
    name: 'Chief Executive Officer',
    description: 'Executive leadership',
    status: 'active',
  },
  {
    id: 'pos-mgr',
    tenantId: DEMO_TENANT_ID,
    code: 'MGR',
    name: 'Manager',
    description: 'People and delivery management',
    status: 'active',
  },
  {
    id: 'pos-acc',
    tenantId: DEMO_TENANT_ID,
    code: 'ACC',
    name: 'Accountant',
    description: 'Finance operations',
    status: 'active',
  },
]

export const identityMemberships: MembershipRecord[] = [
  {
    id: 'mem-1',
    tenantId: DEMO_TENANT_ID,
    userId: 'user-demo',
    companyId: 'company-retail',
    organizationId: 'org-sales',
    positionId: 'pos-mgr',
    isPrimary: true,
    status: 'active',
    validFrom: '2026-01-10',
    validTo: null,
  },
  {
    id: 'mem-2',
    tenantId: DEMO_TENANT_ID,
    userId: 'user-ops',
    companyId: 'company-retail',
    organizationId: 'org-ops',
    positionId: 'pos-mgr',
    isPrimary: true,
    status: 'active',
    validFrom: '2026-02-01',
    validTo: null,
  },
  {
    id: 'mem-3',
    tenantId: DEMO_TENANT_ID,
    userId: 'user-mfa',
    companyId: 'company-wholesale',
    organizationId: 'org-finance',
    positionId: 'pos-acc',
    isPrimary: true,
    status: 'active',
    validFrom: '2026-01-12',
    validTo: null,
  },
]
