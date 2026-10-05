import type { TFunction } from 'i18next'

export type UserStatus = 'active' | 'disabled' | 'invited' | 'draft'

export type SignInMethod = 'password' | 'otp' | 'google' | 'facebook' | 'apple'

export type IdentityUser = {
  id: string
  email: string
  displayName: string
  fullName: string
  phone: string
  isOwner?: boolean
  requireMfa?: boolean
  canInvite?: boolean
  invitationSettings?: InvitationPayload['settings']
  invitationDraft?: InvitationPayload
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
  Pick<IdentityUser, 'email' | 'displayName' | 'fullName' | 'phone' | 'avatarUrl' | 'language' | 'timezone' | 'status'>
>

export function isIdentityProfileComplete(user: Pick<IdentityUser, 'fullName' | 'phone'>): boolean {
  return user.fullName.trim().length > 0 && user.phone.trim().length > 0
}

export function formatStatusLabel(status: string, t: TFunction) {
  if (status === 'draft') return 'Draft'
  if (!status) {
    return status
  }
  if (status === 'active') {
    return t('users.statusActive')
  }
  if (status === 'invited') {
    return t('users.statusInvited')
  }
  if (status === 'disabled') {
    return t('users.statusInactive')
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

export function formatSignInMethod(method: SignInMethod | null, t: TFunction) {
  if (!method) {
    return '—'
  }
  if (method === 'password') {
    return t('users.methodPassword')
  }
  if (method === 'otp') {
    return t('users.methodOtp')
  }
  // Provider names (Google, Apple, Facebook) are brands and stay as-is.
  return `${method.charAt(0).toUpperCase()}${method.slice(1)}`
}

export function formatLastActive(value: string | null, t: TFunction) {
  if (!value) {
    return t('users.lastActiveNever')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return t('users.lastActiveNever')
  }
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfValue = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfValue.getTime()) / 86_400_000)

  if (diffDays === 0) {
    return t('users.lastActiveToday', { time: timeLabel })
  }
  if (diffDays === 1) {
    return t('users.lastActiveYesterday', { time: timeLabel })
  }
  return `${date.toLocaleDateString()} ${timeLabel}`
}

export function formatDirectoryMfa(
  user: Pick<IdentityUser, 'signInMethod' | 'mfaEnabled'>,
  t: TFunction,
) {
  if (!user.signInMethod) {
    return '—'
  }
  return user.mfaEnabled ? t('users.mfaOn') : t('users.mfaOff')
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

export type MembershipStatus = 'active' | 'ended' | 'invited'

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
  roleIds?: string[]
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

export type InvitationAssignment = { companyId: string; organizationId: string; positionId: string; roleIds: string[] }
export type InvitationPayload = {
  email: string; fullName: string; phone: string; assignments: InvitationAssignment[]; departmentId: string; positionId: string

  requireMfa: boolean; canInvite: boolean
  settings: { expiryDays: 7; language: string; personalMessage: string; sendNow: boolean }
}
export type InvitationOptions = {
  departments: InvitationOptions['companies'][number]['departments']
  canInvite: boolean
  companies: { id: string; name: string; groupName: string; requireMfa: boolean; departments: { id: string; name: string; positions: { id: string; name: string }[] }[] }[]
  roles: { id: string; name: string; permissions: { group: string; page: string; action: string }[] }[]
}
