import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { AppShell } from '@/layouts/AppShell'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { ApiError } from '@/services/httpClient'
import { confirmMfaSetup, startMfaSetup } from '@/modules/core/auth/services/authService'
import { useSession } from '@/modules/core/auth/hooks/useSession'
import './AuthForm.css'
import './MfaSetupPage.css'

export function MfaSetupPage() {
  const { user } = useSession()
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSetup() {
      setIsLoading(true)
      setError(null)
      try {
        const result = await startMfaSetup()
        if (!cancelled) {
          setSecret(result.secret)
          setOtpauthUri(result.otpauthUri)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to start MFA setup.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadSetup()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await confirmMfaSetup(code)
      setRecoveryCodes(result.recoveryCodes)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to confirm MFA.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="mfa-setup">
        <h1>Set up MFA</h1>
        <p className="mfa-setup__subtitle">
          Protect high-risk actions with an authenticator app. Current status:{' '}
          <strong>{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</strong>
        </p>

        {isLoading ? <p>Preparing setup…</p> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        {recoveryCodes ? (
          <div className="mfa-setup__done">
            <Alert variant="success">MFA is enabled. Store these recovery codes securely.</Alert>
            <ul className="mfa-setup__codes">
              {recoveryCodes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link to="/">Back to home</Link>
          </div>
        ) : null}

        {!isLoading && !recoveryCodes && secret ? (
          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <Alert variant="info">
              Secret: <code>{secret}</code>
              <br />
              URI: <code>{otpauthUri}</code>
              <br />
              Demo confirmation code: 123456
            </Alert>
            <FormField label="Enter code to confirm" htmlFor="mfa-setup-code">
              <MfaCodeInput
                id="mfa-setup-code"
                value={code}
                onChange={setCode}
                disabled={isSubmitting}
              />
            </FormField>
            <Button type="submit" disabled={isSubmitting || code.length !== 6}>
              {isSubmitting ? 'Confirming…' : 'Enable MFA'}
            </Button>
          </form>
        ) : null}
      </div>
    </AppShell>
  )
}
