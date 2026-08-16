export type UserStatus = 'active' | 'disabled' | 'invited'

export type IdentityUser = {
  id: string
  email: string
  displayName: string
  status: UserStatus
  mfaEnabled: boolean
  createdAt: string
}

export type OrganizationType = 'division' | 'department' | 'team' | 'other'

export type OrganizationNode = {
  id: string
  tenantId: string
  parentId: string | null
  code: string
  name: string
  type: OrganizationType
  status: 'active' | 'inactive'
  sortOrder: number
}

export type PositionRecord = {
  id: string
  tenantId: string
  code: string
  name: string
  description: string
  status: 'active' | 'inactive'
}

export type MembershipStatus = 'active' | 'ended'

export type MembershipRecord = {
  id: string
  tenantId: string
  userId: string
  companyId: string | null
  organizationId: string | null
  positionId: string | null
  isPrimary: boolean
  status: MembershipStatus
  validFrom: string
  validTo: string | null
}

export type CompanyOption = {
  id: string
  name: string
  tenantId: string
}
