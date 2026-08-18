import type { AuthUser } from '@/modules/core/auth/types/auth'
import { identityUsers, setIdentityUserMfaEnabled } from '@/mocks/data/identity'
import { isIdentityProfileComplete } from '@/modules/core/identity/types/identity'

export type MockUser = Omit<AuthUser, 'profileComplete'> & {
  password: string
}

export const MOCK_MFA_CODE = '123456'

export const seedUsers: MockUser[] = [
  {
    id: 'user-demo',
    email: 'demo@aios.dev',
    name: 'Demo User',
    password: 'Password1!',
    mfaEnabled: false,
  },
  {
    id: 'user-mfa',
    email: 'mfa@aios.dev',
    name: 'MFA User',
    password: 'Password1!',
    mfaEnabled: true,
  },
  {
    id: 'user-ops',
    email: 'ops.lead@aios.dev',
    name: 'Ops Lead',
    password: 'Password1!',
    mfaEnabled: false,
  },
  {
    id: 'user-invited',
    email: 'newhire@aios.dev',
    name: 'New Hire',
    password: 'Password1!',
    mfaEnabled: false,
  },
]

export const mockAuthUsers: MockUser[] = [...seedUsers]

export function setMockUserMfaEnabled(userId: string, mfaEnabled: boolean) {
  const authUser = mockAuthUsers.find((item) => item.id === userId)
  if (authUser) {
    authUser.mfaEnabled = mfaEnabled
  }
  setIdentityUserMfaEnabled(userId, mfaEnabled)
}

export function provisionMockAuthUser(input: {
  id: string
  email: string
  name: string
  password?: string
  mfaEnabled?: boolean
}): MockUser {
  const email = input.email.trim().toLowerCase()
  const existing = mockAuthUsers.find((user) => user.id === input.id || user.email === email)
  if (existing) {
    return existing
  }

  const user: MockUser = {
    id: input.id,
    email,
    name: input.name.trim() || email,
    password: input.password ?? 'Password1!',
    mfaEnabled: input.mfaEnabled ?? false,
  }
  mockAuthUsers.push(user)
  return user
}

export function toPublicUser(user: MockUser): AuthUser {
  const identity = identityUsers.find((item) => item.id === user.id || item.email === user.email)
  return {
    id: user.id,
    email: user.email,
    name: identity?.displayName ?? user.name,
    mfaEnabled: user.mfaEnabled,
    profileComplete: identity ? isIdentityProfileComplete(identity) : false,
  }
}
