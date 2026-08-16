import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ApiError } from '@/services/httpClient'
import { completeGoogleOAuth } from '@/modules/core/auth/services/authService'

export function GoogleOAuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function complete() {
      try {
        await completeGoogleOAuth()
        if (!cancelled) {
          navigate('/', { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Google sign-in failed.')
        }
      }
    }

    void complete()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <AuthLayout title="Connecting Google" subtitle="Finishing mock OAuth sign-in…">
      {error ? (
        <Alert variant="error">
          {error} <Link to="/login">Back to login</Link>
        </Alert>
      ) : (
        <p>Please wait…</p>
      )}
    </AuthLayout>
  )
}
