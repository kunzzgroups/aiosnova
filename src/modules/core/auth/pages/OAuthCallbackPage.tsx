import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ApiError } from '@/services/httpClient'
import { completeOAuth, type OAuthProvider } from '@/modules/core/auth/services/authService'
import { postAuthPath } from '@/modules/core/auth/types/auth'

const PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'apple']

function isOAuthProvider(value: string | undefined): value is OAuthProvider {
  return Boolean(value && PROVIDERS.includes(value as OAuthProvider))
}

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { provider } = useParams<{ provider: string }>()
  const [error, setError] = useState<string | null>(null)
  const label = provider ? provider[0]!.toUpperCase() + provider.slice(1) : 'OAuth'

  useEffect(() => {
    let cancelled = false

    async function complete() {
      if (!isOAuthProvider(provider)) {
        setError('Unsupported sign-in provider.')
        return
      }

      try {
        const result = await completeOAuth(provider)
        if (!cancelled) {
          navigate(postAuthPath(result.user), { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : `${label} sign-in failed.`)
        }
      }
    }

    void complete()
    return () => {
      cancelled = true
    }
  }, [navigate, provider, label])

  return (
    <AuthLayout title={`Connecting ${label}`} subtitle="Finishing mock OAuth sign-in…">
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

/** @deprecated Use OAuthCallbackPage */
export function GoogleOAuthCallbackPage() {
  return <OAuthCallbackPage />
}
