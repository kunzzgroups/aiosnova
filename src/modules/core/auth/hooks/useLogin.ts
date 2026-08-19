import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { postAuthPath } from '@/modules/core/auth/types/auth'
import { requestLoginTac, verifyLoginTac } from '@/modules/core/auth/services/authService'

export function useLogin() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleRequestTac(payload: { email?: string; phone?: string }) {
    setError(null)
    setMessage(null)
    try {
      const result = await requestLoginTac(payload)
      setMessage(result.demoHint ? `${result.message} ${result.demoHint}` : result.message)
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send OTP.')
      return false
    }
  }

  async function handleVerifyTac(payload: { email?: string; phone?: string; code: string }) {
    setIsSubmitting(true)
    setError(null)
    try {
      await verifyLoginTac(payload)
      navigate(postAuthPath())
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
    handleRequestTac,
    handleVerifyTac,
  }
}
