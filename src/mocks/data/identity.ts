import type {
  InvitationOptions,
  CompanyRecord,
  IdentityUser,
  MembershipRecord,
  OrganizationNode,
  PositionRecord,
  SignInMethod,
  UserStatus,
} from '@/modules/core/identity/types/identity'

export const DEMO_MERCHANT_ID = 'merchant-acme'

const emptyProfile = {
  fullName: '',
  phone: '',
  avatarUrl: '',
  language: 'en',
  timezone: 'Asia/Kuala_Lumpur',
}

export type CompanyGroupRecord = {
  id: string
  name: string
  companyIds: string[]
}

export const identityCompanies: CompanyRecord[] = [
  {
    id: 'company-retail',
    merchantId: DEMO_MERCHANT_ID,
    code: 'RETAIL',
    name: 'Acme Retail',
    status: 'active',
    createdAt: '2026-01-08T08:00:00.000Z',
  },
  {
    id: 'company-wholesale',
    merchantId: DEMO_MERCHANT_ID,
    code: 'WHOLESALE',
    name: 'Acme Wholesale',
    status: 'active',
    createdAt: '2026-01-09T08:00:00.000Z',
  },
  {
    id: 'company-j1',
    merchantId: DEMO_MERCHANT_ID,
    code: 'J1',
    name: 'J1 (MIDVALLEY)',
    status: 'active',
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'company-j2',
    merchantId: DEMO_MERCHANT_ID,
    code: 'J2',
    name: 'J2 (PARADIGM MALL)',
    status: 'active',
    createdAt: '2026-01-11T08:00:00.000Z',
  },
  {
    id: 'company-tokyo-izakaya',
    merchantId: DEMO_MERCHANT_ID,
    code: 'TOKYO-I',
    name: 'TOKYO IZAKAYA SDN BHD',
    status: 'active',
    createdAt: '2026-01-12T08:00:00.000Z',
  },
]

/** Groups shown under GROUP COMPANIES. Companies not listed here appear as standalone L2 items. */
export const identityCompanyGroups: CompanyGroupRecord[] = [
  {
    id: 'group-kunzz',
    name: 'KUNZZ HOLDINGS SDN BHD',
    companyIds: ['company-retail', 'company-wholesale'],
  },
  {
    id: 'group-tokyo-cuisine',
    name: 'TOKYO JAPANESE CUISINE SDN BHD',
    companyIds: ['company-j1', 'company-j2'],
  },
]

export const identityUsers: IdentityUser[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
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
    merchantId: DEMO_MERCHANT_ID,
    parentId: null,
    code: 'HQ',
    name: 'Acme Headquarters',
    type: 'division',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-retail',
    merchantId: DEMO_MERCHANT_ID,
    parentId: 'org-hq',
    code: 'RET',
    name: 'Retail Division',
    type: 'division',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-sales',
    merchantId: DEMO_MERCHANT_ID,
    parentId: 'org-retail',
    code: 'SAL',
    name: 'Sales Department',
    type: 'department',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'org-ops',
    merchantId: DEMO_MERCHANT_ID,
    parentId: 'org-hq',
    code: 'OPS',
    name: 'Operations',
    type: 'department',
    status: 'active',
    sortOrder: 2,
  },
  {
    id: 'org-finance',
    merchantId: DEMO_MERCHANT_ID,
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
    merchantId: DEMO_MERCHANT_ID,
    code: 'CEO',
    name: 'Chief Executive Officer',
    description: 'Executive leadership',
    status: 'active',
  },
  {
    id: 'pos-mgr',
    merchantId: DEMO_MERCHANT_ID,
    code: 'MGR',
    name: 'Manager',
    description: 'People and delivery management',
    status: 'active',
  },
  {
    id: 'pos-acc',
    merchantId: DEMO_MERCHANT_ID,
    code: 'ACC',
    name: 'Accountant',
    description: 'Finance operations',
    status: 'active',
  },
]

export const identityMemberships: MembershipRecord[] = [
  {
    id: 'mem-1',
    merchantId: DEMO_MERCHANT_ID,
    userId: '00000000-0000-4000-8000-000000000001',
    companyId: 'company-retail',
    organizationId: 'org-sales',
    positionId: 'pos-mgr',
    isPrimary: true,
    status: 'active',
    validFrom: '2026-01-10',
    validTo: null,
  },
]

// Preset department and position records used by the invitation mock.
identityOrganizations.push({ id:'org-hr',merchantId:DEMO_MERCHANT_ID,parentId:'org-hq',code:'HR',name:'HR',type:'department',status:'active',sortOrder:4 })
identityPositions.push(
  { id:'pos-hr-lead',merchantId:DEMO_MERCHANT_ID,code:'HR-LEAD',name:'HR Lead',description:'HR leadership',status:'active' },
  { id:'pos-hr',merchantId:DEMO_MERCHANT_ID,code:'HR',name:'HR',description:'HR staff',status:'active' },
  { id:'pos-finance-mgr',merchantId:DEMO_MERCHANT_ID,code:'FIN-MGR',name:'Finance Manager',description:'Finance leadership',status:'active' },
)
// Mock Permissions-module presets. The users page only reads these definitions.
export const identityRolePresets: InvitationOptions['roles'] = [
  { id: 'role-manager', name: 'Manager', permissions: [{ group: 'Work Management', page: 'Projects', action: 'View' }, { group: 'Work Management', page: 'Documents', action: 'View' }] },
  { id: 'role-staff', name: 'Staff', permissions: [{ group: 'Work Management', page: 'Documents', action: 'View' }] },
  { id: 'role-hr', name: 'HR', permissions: [{ group: 'Finance & People', page: 'HRM', action: 'View' }] },
  { id: 'role-finance', name: 'Finance', permissions: [{ group: 'Finance & People', page: 'Finance', action: 'View' }] },
]
export function mockInvitationOptions(canInvite: boolean): InvitationOptions {
  const departments = identityOrganizations.filter(o=>o.type==='department' && o.status==='active').map(o=>({id:o.id,name:o.name,
      positions:identityPositions.filter(p=>p.status==='active' && (o.id==='org-finance' ? ['pos-finance-mgr','pos-acc'].includes(p.id) : o.id==='org-hr' ? ['pos-hr-lead','pos-hr'].includes(p.id) : p.id==='pos-mgr')).map(p=>({id:p.id,name:p.name}))
    }))
  return { canInvite, departments, roles: identityRolePresets, companies: identityCompanies.filter(c=>c.status==='active').map(c=>({
    id:c.id, name:c.name, groupName:identityCompanyGroups.find(g=>g.companyIds.includes(c.id))?.name || c.name,
    requireMfa:c.id==='company-retail',
    departments
  })) }
}
identityUsers[0]!.isOwner = true
