export type AuthUser = {
  id: string
  email: string
  name: string
  mfaEnabled: boolean
  profileComplete: boolean
}

export type LoginSuccessResponse = {
  accessToken: string
  user: AuthUser
}

export type MfaRequiredResponse = {
  status: 'mfa_required'
  mfaTicket: string
}

export type LoginResponse = LoginSuccessResponse | MfaRequiredResponse

export type LoginRequest = {
  email: string
  password: string
}

export type MfaVerifyRequest = {
  mfaTicket: string
  code: string
}

export type ForgotPasswordRequest = {
  email: string
}

export type ResetPasswordRequest = {
  token: string
  password: string
}

export type MfaSetupStartResponse = {
  secret: string
  otpauthUri: string
}

export type MfaSetupConfirmRequest = {
  code: string
}

export type MfaSetupConfirmResponse = {
  recoveryCodes: string[]
  user: AuthUser
}

export type MfaDisableRequest = {
  code: string
}

export type MfaDisableResponse = {
  user: AuthUser
}

export type MessageResponse = {
  message: string
}

export function isMfaRequired(response: LoginResponse): response is MfaRequiredResponse {
  return 'status' in response && response.status === 'mfa_required'
}

export function postAuthPath(user: AuthUser) {
  return user.profileComplete ? '/' : '/profile/complete'
}
