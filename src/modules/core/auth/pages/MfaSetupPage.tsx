import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { ApiError } from '@/services/httpClient'
import { confirmMfaSetup, disableMfa, startMfaSetup } from '@/modules/core/auth/services/authService'
import { useSession } from '@/modules/core/auth/hooks/useSession'
import './AuthForm.css'
import './MfaSetupPage.css'

export function MfaSetupPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [justDisabled, setJustDisabled] = useState(false)

  const mfaEnabled = Boolean(user?.mfaEnabled)

  useEffect(() => {
    if (mfaEnabled || justDisabled) {
      setIsLoading(false)
      setSecret(null)
      setOtpauthUri(null)
      return
    }

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
  }, [mfaEnabled, justDisabled])

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await confirmMfaSetup(code)
      setRecoveryCodes(result.recoveryCodes)
      setCode('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to confirm MFA.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await disableMfa(code)
      setCode('')
      setJustDisabled(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disable MFA.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleStartEnable() {
    setJustDisabled(false)
    setError(null)
    setCode('')
  }

  return (
    <div className="mfa-setup">
      <header className="mfa-setup__header">
        <div>
          <h1>{mfaEnabled ? 'Manage MFA' : 'Set up MFA'}</h1>
          <p className="mfa-setup__subtitle">
            Protect high-risk actions with an authenticator app. Current status:{' '}
            <strong>{mfaEnabled ? 'Enabled' : 'Not enabled'}</strong>
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Back
        </Button>
      </header>

      {isLoading ? <p>Preparing setup…</p> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      {justDisabled ? (
        <div className="mfa-setup__done">
          <Alert variant="success">MFA has been disabled.</Alert>
          <div className="mfa-setup__actions">
            <Button variant="secondary" onClick={handleStartEnable}>
              Set up MFA again
            </Button>
            <Link to="/">Back to home</Link>
          </div>
        </div>
      ) : null}

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

      {mfaEnabled && !recoveryCodes ? (
        <form className="auth-form" onSubmit={(event) => void handleDisable(event)}>
          <Alert variant="info">
            Enter a current authenticator code to turn MFA off. Demo code: 123456
          </Alert>
          <FormField label="Enter code to disable" htmlFor="mfa-disable-code">
            <MfaCodeInput
              id="mfa-disable-code"
              value={code}
              onChange={setCode}
              disabled={isSubmitting}
            />
          </FormField>
          <Button type="submit" variant="danger" disabled={isSubmitting || code.length !== 6}>
            {isSubmitting ? 'Disabling…' : 'Disable MFA'}
          </Button>
        </form>
      ) : null}

      {!isLoading && !mfaEnabled && !justDisabled && !recoveryCodes && secret ? (
        <form className="auth-form" onSubmit={(event) => void handleEnable(event)}>
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
  )
}
