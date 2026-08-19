export type UserStatus = 'active' | 'disabled' | 'invited'

export type SignInMethod = 'password' | 'google' | 'facebook' | 'apple'

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
  signInMethod: SignInMethod | null
  mfaEnabled: boolean
  lastActiveAt: string | null
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

export function formatSignInMethod(method: SignInMethod | null) {
  if (!method) {
    return '—'
  }
  if (method === 'password') {
    return 'Password'
  }
  return `${method.charAt(0).toUpperCase()}${method.slice(1)}`
}

export function formatLastActive(value: string | null) {
  if (!value) {
    return 'Never'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Never'
  }
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfValue = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfValue.getTime()) / 86_400_000)

  if (diffDays === 0) {
    return `Today ${timeLabel}`
  }
  if (diffDays === 1) {
    return `Yesterday ${timeLabel}`
  }
  return `${date.toLocaleDateString()} ${timeLabel}`
}

export function formatDirectoryMfa(user: Pick<IdentityUser, 'signInMethod' | 'mfaEnabled'>) {
  if (!user.signInMethod) {
    return '—'
  }
  return user.mfaEnabled ? 'On' : 'Off'
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

export type CompanyStatus = 'active' | 'inactive'

export type CompanyRecord = {
  id: string
  tenantId: string
  code: string
  name: string
  status: CompanyStatus
  createdAt: string
}

export type CompanyOption = CompanyRecord
