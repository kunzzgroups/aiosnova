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

export const DEMO_TENANT_ID = 'tenant-acme'

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
    tenantId: DEMO_TENANT_ID,
    code: 'RETAIL',
    name: 'Acme Retail',
    status: 'active',
    createdAt: '2026-01-08T08:00:00.000Z',
  },
  {
    id: 'company-wholesale',
    tenantId: DEMO_TENANT_ID,
    code: 'WHOLESALE',
    name: 'Acme Wholesale',
    status: 'active',
    createdAt: '2026-01-09T08:00:00.000Z',
  },
  {
    id: 'company-j1',
    tenantId: DEMO_TENANT_ID,
    code: 'J1',
    name: 'J1 (MIDVALLEY)',
    status: 'active',
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'company-j2',
    tenantId: DEMO_TENANT_ID,
    code: 'J2',
    name: 'J2 (PARADIGM MALL)',
    status: 'active',
    createdAt: '2026-01-11T08:00:00.000Z',
  },
  {
    id: 'company-tokyo-izakaya',
    tenantId: DEMO_TENANT_ID,
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

// Preset department and position records used by the invitation mock.
identityOrganizations.push({ id:'org-hr',tenantId:DEMO_TENANT_ID,parentId:'org-hq',code:'HR',name:'HR',type:'department',status:'active',sortOrder:4 })
identityPositions.push(
  { id:'pos-hr-lead',tenantId:DEMO_TENANT_ID,code:'HR-LEAD',name:'HR Lead',description:'HR leadership',status:'active' },
  { id:'pos-hr',tenantId:DEMO_TENANT_ID,code:'HR',name:'HR',description:'HR staff',status:'active' },
  { id:'pos-finance-mgr',tenantId:DEMO_TENANT_ID,code:'FIN-MGR',name:'Finance Manager',description:'Finance leadership',status:'active' },
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

// Explicit owner access for this local demo identity only.
// Google sign-in itself does not grant ownership to other accounts.
const googleDemoOwner = upsertIdentityUser({
  id: 'user-google',
  email: 'google.user@aios.dev',
  displayName: 'Google User',
  status: 'active',
  signInMethod: 'google',
})
googleDemoOwner.canInvite = true
googleDemoOwner.isOwner = true

// BEGIN TEMPORARY AUTO-FIT DEMO DATA
// Set to 0 to disable, or delete this entire marked block after testing.
// These are directory fixtures, not sign-in accounts.
const AUTO_FIT_DEMO_USER_COUNT = 20
const autoFitDemoNames = ['Sarah Lee', 'Daniel Tan', 'Michelle Wong', 'Amir Hassan', 'Emily Chen', 'Jason Lim', 'Nur Aisyah', 'Kevin Ng', 'Grace Teo', 'Ryan Yap', 'Aisha Rahman', 'Ethan Ong', 'Chloe Goh', 'David Chan', 'Hannah Low', 'Marcus Koh', 'Olivia Ho', 'Zara Ismail', 'Adam Chew', 'Sofia Lau']
const autoFitDemoOptions = mockInvitationOptions(false)
for (let index = 0; index < AUTO_FIT_DEMO_USER_COUNT; index++) {
  const number = index + 1
  const id = `user-autofit-demo-${number}`
  const fullName = autoFitDemoNames[index % autoFitDemoNames.length]!
  const company = autoFitDemoOptions.companies[index % autoFitDemoOptions.companies.length]!
  const department = autoFitDemoOptions.departments[index % autoFitDemoOptions.departments.length]!
  const position = department.positions[index % department.positions.length]!
  const status: UserStatus = index === 3 ? 'invited' : index === 7 ? 'disabled' : 'active'
  const createdAt = new Date(Date.UTC(2026, 9, 1 + index % 6, 8)).toISOString()
  identityUsers.push({
    ...emptyProfile,
    id,
    email: `autofit.employee.${number}@example.test`,
    displayName: fullName,
    fullName,
    phone: `+60 12-345 ${String(2000 + number)}`,
    status,
    signInMethod: status === 'invited' ? null : 'otp',
    mfaEnabled: status !== 'invited' && index % 3 === 0,
    createdAt,
    lastActiveAt: status === 'invited' ? null : createdAt,
  })
  identityMemberships.push({
    id: `mem-autofit-demo-${number}`,
    tenantId: DEMO_TENANT_ID,
    userId: id,
    companyId: company.id,
    organizationId: department.id,
    positionId: position.id,
    roleIds: [],
    isPrimary: true,
    status: status === 'invited' ? 'invited' : 'active',
    validFrom: createdAt.slice(0, 10),
    validTo: null,
  })
}
// END TEMPORARY AUTO-FIT DEMO DATA
