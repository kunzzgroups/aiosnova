import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { isMfaRequired, postAuthPath } from '@/modules/core/auth/types/auth'
import { login, requestLoginTac, verifyLoginTac } from '@/modules/core/auth/services/authService'
import { clearRememberedLogin, writeRememberedLogin } from '@/modules/core/auth/utils/rememberedLogin'

export function useLogin() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleLogin(email: string, password: string, rememberMe = false) {
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      const result = await login({ email, password })
      if (rememberMe) {
        writeRememberedLogin(email, password)
      } else {
        clearRememberedLogin()
      }
      if (isMfaRequired(result)) {
        navigate('/mfa/challenge')
        return
      }
      navigate(postAuthPath(result.user))
    } catch (err) {
      const next = err instanceof ApiError ? err.message : 'Unable to sign in.'
      setError(next)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRequestTac(phone: string) {
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await requestLoginTac({ phone })
      setMessage(result.demoHint ? `${result.message} ${result.demoHint}` : result.message)
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send OTP.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerifyTac(phone: string, code: string) {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await verifyLoginTac({ phone, code })
      navigate(postAuthPath(result.user))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    isSubmitting,
    error,
    message,
    setError,
    setMessage,
    handleLogin,
    handleRequestTac,
    handleVerifyTac,
  }
}
