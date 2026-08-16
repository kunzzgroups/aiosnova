import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ApiError } from '@/services/httpClient'
import { startGoogleOAuth } from '@/modules/core/auth/services/authService'
import './GoogleSignInButton.css'

export function GoogleSignInButton() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setIsLoading(true)
    setError(null)

    try {
      const redirectUrl = await startGoogleOAuth()
      navigate(redirectUrl)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to start Google sign-in.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="google-sign-in">
      <Button
        type="button"
        variant="secondary"
        fullWidth
        size="lg"
        disabled={isLoading}
        onClick={() => void handleClick()}
      >
        {isLoading ? 'Connecting…' : 'Continue with Google'}
      </Button>
      {error ? <p className="google-sign-in__error">{error}</p> : null}
    </div>
  )
}
