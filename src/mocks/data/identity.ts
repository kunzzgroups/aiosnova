import type {
  CompanyOption,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
  SignInMethod,
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
    signInMethod: 'password',
    mfaEnabled: false,
    lastActiveAt: '2026-08-18T02:32:00.000Z',
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
    signInMethod: 'password',
    mfaEnabled: true,
    lastActiveAt: '2026-08-17T08:00:00.000Z',
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
    signInMethod: 'password',
    mfaEnabled: false,
    lastActiveAt: '2026-08-15T09:10:00.000Z',
    createdAt: '2026-02-01T08:00:00.000Z',
  },
  {
    id: 'user-invited',
    email: 'newhire@aios.dev',
    displayName: 'New Hire',
    ...emptyProfile,
    status: 'invited',
    signInMethod: null,
    mfaEnabled: false,
    lastActiveAt: null,
    createdAt: '2026-08-01T08:00:00.000Z',
  },
]

export function upsertIdentityUser(input: {
  id: string
  email: string
  displayName: string
  status?: UserStatus
  signInMethod?: SignInMethod | null
  mfaEnabled?: boolean
  lastActiveAt?: string | null
}): IdentityUser {
  const email = input.email.trim().toLowerCase()
  const existing = identityUsers.find((user) => user.id === input.id || user.email === email)
  if (existing) {
    if (input.signInMethod !== undefined) {
      existing.signInMethod = input.signInMethod
    }
    if (input.lastActiveAt !== undefined) {
      existing.lastActiveAt = input.lastActiveAt
    }
    if (input.status !== undefined) {
      existing.status = input.status
    }
    return existing
  }

  const user: IdentityUser = {
    id: input.id,
    email,
    displayName: input.displayName.trim() || email,
    ...emptyProfile,
    status: input.status ?? 'active',
    signInMethod: input.signInMethod ?? null,
    mfaEnabled: input.mfaEnabled ?? false,
    lastActiveAt: input.lastActiveAt ?? null,
    createdAt: new Date().toISOString(),
  }

  identityUsers.push(user)
  return user
}

export function recordIdentitySignIn(userId: string, method: SignInMethod) {
  const user = identityUsers.find((item) => item.id === userId)
  if (!user) {
    return
  }
  user.signInMethod = method
  user.lastActiveAt = new Date().toISOString()
  if (user.status === 'invited') {
    user.status = 'active'
  }
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
