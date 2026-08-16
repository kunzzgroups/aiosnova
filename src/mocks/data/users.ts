import type { AuthUser } from '@/modules/core/auth/types/auth'

export type MockUser = AuthUser & {
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

export function toPublicUser(user: MockUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mfaEnabled: user.mfaEnabled,
  }
}
