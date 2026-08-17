import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { isMfaRequired, postAuthPath } from '@/modules/core/auth/types/auth'
import { login } from '@/modules/core/auth/services/authService'
import { clearRememberedLogin, writeRememberedLogin } from '@/modules/core/auth/utils/rememberedLogin'

export function useLogin() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(email: string, password: string, rememberMe = false) {
    setIsSubmitting(true)
    setError(null)

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
      const message = err instanceof ApiError ? err.message : 'Unable to sign in.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    isSubmitting,
    error,
    handleLogin,
  }
}
