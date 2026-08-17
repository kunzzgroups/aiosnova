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
]

export const mockAuthUsers: MockUser[] = [...seedUsers]

export function setMockUserMfaEnabled(userId: string, mfaEnabled: boolean) {
  const authUser = mockAuthUsers.find((item) => item.id === userId)
  if (authUser) {
    authUser.mfaEnabled = mfaEnabled
  }
  setIdentityUserMfaEnabled(userId, mfaEnabled)
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
