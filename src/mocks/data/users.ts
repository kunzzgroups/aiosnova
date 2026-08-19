import type { AuthUser } from '@/modules/core/auth/types/auth'
import { identityUsers, setIdentityUserMfaEnabled } from '@/mocks/data/identity'
import { isIdentityProfileComplete } from '@/modules/core/identity/types/identity'
import { isValidPassword } from '@/modules/core/auth/utils/passwordPolicy'

export type MockUser = Omit<AuthUser, 'profileComplete'> & {
  password: string
}

export const MOCK_MFA_CODE = '123456'
export const DEMO_LOGIN_PASSWORD = 'Password1!'

export const seedUsers: MockUser[] = [
  {
    id: 'user-demo',
    email: 'demo@aios.dev',
    name: 'Demo User',
    password: DEMO_LOGIN_PASSWORD,
    mfaEnabled: false,
  },
  {
    id: 'user-mfa',
    email: 'mfa@aios.dev',
    name: 'MFA User',
    password: DEMO_LOGIN_PASSWORD,
    mfaEnabled: true,
  },
  {
    id: 'user-ops',
    email: 'ops.lead@aios.dev',
    name: 'Ops Lead',
    password: DEMO_LOGIN_PASSWORD,
    mfaEnabled: false,
  },
  {
    id: 'user-invited',
    email: 'newhire@aios.dev',
    name: 'New Hire',
    password: DEMO_LOGIN_PASSWORD,
    mfaEnabled: false,
  },
]

export const mockAuthUsers: MockUser[] = [...seedUsers]

export function provisionMockAuthUser(input: {
  id: string
  email: string
  name: string
  mfaEnabled?: boolean
  password?: string
}): MockUser {
  const email = input.email.trim().toLowerCase()
  const existing = mockAuthUsers.find((item) => item.id === input.id || item.email === email)
  if (existing) {
    return existing
  }

  const user: MockUser = {
    id: input.id,
    email,
    name: input.name,
    password: input.password && isValidPassword(input.password) ? input.password : DEMO_LOGIN_PASSWORD,
    mfaEnabled: input.mfaEnabled ?? false,
  }
  mockAuthUsers.push(user)
  return user
}

export function removeMockAuthUser(userId: string) {
  const index = mockAuthUsers.findIndex((item) => item.id === userId)
  if (index >= 0) {
    mockAuthUsers.splice(index, 1)
  }
}

export function updateMockAuthUser(
  userId: string,
  patch: Partial<Pick<MockUser, 'email' | 'name'>>,
) {
  const authUser = mockAuthUsers.find((item) => item.id === userId)
  if (!authUser) {
    return
  }
  if (patch.email !== undefined) {
    authUser.email = patch.email
  }
  if (patch.name !== undefined) {
    authUser.name = patch.name
  }
}

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
