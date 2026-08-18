import type { ReactElement } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/services/httpClient'
import { startOAuth, type OAuthProvider } from '@/modules/core/auth/services/authService'
import './SocialAuthButtons.css'

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3 5.8 14.9l-2.7 2.1C4.8 19.7 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-5.9-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3.1 7c-.5 1-.8 2.1-.8 3.3s.3 2.3.8 3.3c0 .1 3.5-2.7 3.5-2.7-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.1 7z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.3c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.3 14.7 1.3 12 1.3 8.1 1.3 4.8 3.6 3.1 7l3.5 2.7C7.4 7.2 9.7 5.3 12 5.3z"
      />
    </svg>
  )
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden>
      <path
        fill="#111111"
        d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.3-.9-2.3-3.5zM14.4 5.8c.6-.8 1.1-1.8.9-2.9-0.9.1-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.3z"
      />
    </svg>
  )
}

const providers: Array<{
  id: OAuthProvider
  label: string
  icon: () => ReactElement
}> = [
  { id: 'google', label: 'Google', icon: GoogleGlyph },
  { id: 'apple', label: 'Apple', icon: AppleGlyph },
]

export function SocialAuthButtons() {
  const navigate = useNavigate()
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleClick(provider: OAuthProvider) {
    setLoadingProvider(provider)
    setError(null)

    try {
      const redirectUrl = await startOAuth(provider)
      navigate(redirectUrl)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : `Unable to start ${provider} sign-in.`
      setError(message)
    } finally {
      setLoadingProvider(null)
    }
  }

  return (
    <div className="social-auth">
      <div className="social-auth__row" role="group" aria-label="Social sign-in">
        {providers.map((provider) => {
          const Icon = provider.icon
          const isLoading = loadingProvider === provider.id
          return (
            <button
              key={provider.id}
              type="button"
              className="social-auth__button"
              aria-label={`Continue with ${provider.label}`}
              title={provider.label}
              disabled={loadingProvider !== null}
              onClick={() => void handleClick(provider.id)}
            >
              {isLoading ? <span className="social-auth__spinner" /> : <Icon />}
            </button>
          )
        })}
      </div>
      {error ? <p className="social-auth__error">{error}</p> : null}
    </div>
  )
}

/** @deprecated Use SocialAuthButtons */
export function GoogleSignInButton() {
  return <SocialAuthButtons />
}
