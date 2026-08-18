import { apiRequest, refreshSession } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import type {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  LoginSuccessResponse,
  MfaDisableResponse,
  MfaSetupConfirmResponse,
  MfaSetupStartResponse,
  MfaVerifyRequest,
  MessageResponse,
  ResetPasswordRequest,
} from '@/modules/core/auth/types/auth'
import { isMfaRequired } from '@/modules/core/auth/types/auth'

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: payload,
  })

  if (isMfaRequired(data)) {
    useAuthStore.getState().setMfaTicket(data.mfaTicket)
    return data
  }

  useAuthStore.getState().setSession(data.accessToken, data.user)
  return data
}

export async function verifyMfa(payload: MfaVerifyRequest): Promise<LoginSuccessResponse> {
  const data = await apiRequest<LoginSuccessResponse>('/api/auth/mfa/verify', {
    method: 'POST',
    body: payload,
  })
  useAuthStore.getState().setSession(data.accessToken, data.user)
  return data
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<MessageResponse>('/api/auth/logout', {
      method: 'POST',
      csrf: true,
    })
  } finally {
    useAuthStore.getState().clearSession()
  }
}

export type OAuthProvider = 'google' | 'apple'

export async function startOAuth(provider: OAuthProvider): Promise<string> {
  const data = await apiRequest<{ redirectUrl: string }>(`/api/auth/oauth/${provider}/start`)
  return data.redirectUrl
}

export async function completeOAuth(provider: OAuthProvider): Promise<LoginSuccessResponse> {
  const data = await apiRequest<LoginSuccessResponse>(`/api/auth/oauth/${provider}/callback`)
  useAuthStore.getState().setSession(data.accessToken, data.user)
  return data
}

export async function forgotPassword(payload: ForgotPasswordRequest) {
  return apiRequest<MessageResponse & { demoResetToken?: string }>('/api/auth/password/forgot', {
    method: 'POST',
    body: payload,
  })
}

export async function resetPassword(payload: ResetPasswordRequest) {
  return apiRequest<MessageResponse>('/api/auth/password/reset', {
    method: 'POST',
    body: payload,
  })
}

export async function setOwnPassword(password: string) {
  return apiRequest<MessageResponse>('/api/auth/password/set', {
    method: 'POST',
    auth: true,
    body: { password },
  })
}

export async function startMfaSetup() {
  return apiRequest<MfaSetupStartResponse>('/api/auth/mfa/setup/start', {
    method: 'POST',
    auth: true,
  })
}

export async function confirmMfaSetup(code: string) {
  const data = await apiRequest<MfaSetupConfirmResponse>('/api/auth/mfa/setup/confirm', {
    method: 'POST',
    auth: true,
    body: { code },
  })
  useAuthStore.getState().setUser(data.user)
  return data
}

export async function disableMfa(code: string) {
  const data = await apiRequest<MfaDisableResponse>('/api/auth/mfa/disable', {
    method: 'POST',
    auth: true,
    body: { code },
  })
  useAuthStore.getState().setUser(data.user)
  return data
}

export async function hydrateSession(): Promise<void> {
  const store = useAuthStore.getState()
  if (store.accessToken) {
    store.setHydrated(true)
    return
  }

  await refreshSession()
  useAuthStore.getState().setHydrated(true)
}
