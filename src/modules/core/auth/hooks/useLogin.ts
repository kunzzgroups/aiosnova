import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { isMfaRequired } from '@/modules/core/auth/types/auth'
import { login } from '@/modules/core/auth/services/authService'

export function useLogin() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(email: string, password: string) {
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await login({ email, password })
      if (isMfaRequired(result)) {
        navigate('/mfa/challenge')
        return
      }
      navigate('/')
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
