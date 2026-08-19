import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { verifyMfa } from '@/modules/core/auth/services/authService'
import { postAuthPath } from '@/modules/core/auth/types/auth'

export function useMfaChallenge() {
  const navigate = useNavigate()
  const mfaTicket = useAuthStore((state) => state.mfaTicket)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleVerify(code: string) {
    if (!mfaTicket) {
      setError('MFA challenge expired. Please sign in again.')
      navigate('/login')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await verifyMfa({ mfaTicket, code })
      navigate(postAuthPath())
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to verify code.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    mfaTicket,
    isSubmitting,
    error,
    handleVerify,
  }
}
