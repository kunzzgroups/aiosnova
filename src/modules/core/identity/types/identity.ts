export type UserStatus = 'active' | 'disabled' | 'invited'

export type IdentityUser = {
  id: string
  email: string
  displayName: string
  fullName: string
  phone: string
  avatarUrl: string
  language: string
  timezone: string
  status: UserStatus
  mfaEnabled: boolean
  createdAt: string
}

export type IdentityProfilePayload = Partial<
  Pick<IdentityUser, 'displayName' | 'fullName' | 'phone' | 'avatarUrl' | 'language' | 'timezone' | 'status'>
>

export function isIdentityProfileComplete(user: Pick<IdentityUser, 'fullName' | 'phone'>): boolean {
  return user.fullName.trim().length > 0 && user.phone.trim().length > 0
}

export function formatStatusLabel(status: string) {
  if (!status) {
    return status
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

export const PROFILE_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
  { value: 'ms', label: 'Bahasa Melayu' },
] as const

export const PROFILE_TIMEZONES = [
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala Lumpur' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'UTC', label: 'UTC' },
] as const

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
