import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import { confirmMfaSetup, disableMfa, startMfaSetup } from '@/modules/core/auth/services/authService'
import { disableUserMfa, enableUserMfa, fetchUser } from '@/modules/core/identity/services/identityService'
import type { IdentityUser } from '@/modules/core/identity/types/identity'
import { notifySuccess } from '@/stores/toastStore'
import './AuthForm.css'
import './MfaSetupPage.css'

export function MfaSetupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionUser = useAuthStore((state) => state.user)
  const userId = searchParams.get('userId') || sessionUser?.id || ''
  const mfaMode = searchParams.get('mode') || 'require'
  const resetMode = mfaMode === 'reset'

  const [user, setUser] = useState<IdentityUser | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isSelf = Boolean(sessionUser && user && sessionUser.id === user.id)
  const mfaEnabled = Boolean(user?.mfaEnabled)

  const loadUser = useCallback(async () => {
    if (!userId) {
      setError('User not found.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchUser(userId)
      setUser(result.user)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load user.')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  useEffect(() => {
    if (!user || (mfaEnabled && !resetMode) || recoveryCodes) {
      setSecret(null)
      setOtpauthUri(null)
      return
    }

    const account = user
    let cancelled = false

    async function loadSetup() {
      setError(null)
      try {
        if (isSelf) {
          const result = await startMfaSetup()
          if (!cancelled) {
            setSecret(result.secret)
            setOtpauthUri(result.otpauthUri)
          }
          return
        }

        if (!cancelled) {
          setSecret('AIOSMOCKSECRET')
          setOtpauthUri(`otpauth://totp/AIOS:${account.email}?secret=AIOSMOCKSECRET&issuer=AIOS`)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to start MFA setup.')
        }
      }
    }

    void loadSetup()
    return () => {
      cancelled = true
    }
  }, [user, isSelf, mfaEnabled, resetMode, recoveryCodes])

  function syncSession(nextUser: IdentityUser) {
    if (sessionUser?.id === nextUser.id) {
      useAuthStore.getState().setUser({
        ...sessionUser,
        mfaEnabled: nextUser.mfaEnabled,
      })
    }
  }

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      return
    }
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      if (isSelf) {
        const result = await confirmMfaSetup(code)
        setRecoveryCodes(result.recoveryCodes)
        notifySuccess('MFA is enabled. Store these recovery codes securely.')
        const refreshed = await fetchUser(user.id)
        setUser(refreshed.user)
        syncSession(refreshed.user)
      } else {
        if (resetMode) {
          // Admin "reset" = disable first, then re-enable (mock endpoints require MFA off for enable).
          await disableUserMfa(user.id, code)
        }

        const result = await enableUserMfa(user.id, code)
        setUser(result.user)
        setMessage(result.message)
      }
      setCode('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to enable MFA.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      return
    }
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      if (isSelf) {
        await disableMfa(code)
        const refreshed = await fetchUser(user.id)
        setUser(refreshed.user)
        syncSession(refreshed.user)
        setMessage('MFA has been disabled.')
      } else {
        const result = await disableUserMfa(user.id, code)
        setUser(result.user)
        setMessage(result.message)
      }
      setCode('')
      setRecoveryCodes(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disable MFA.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mfa-setup">
      <header className="mfa-setup__header">
        <div>
          <h1>Manage MFA</h1>
          <p className="mfa-setup__subtitle">
            Add this account to an authenticator app, then enter the 6-digit MFA code.
            {user ? (
              <>
                {' '}
                Current status: <strong>{mfaEnabled ? 'On' : 'Off'}</strong>
              </>
            ) : null}
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Back
        </Button>
      </header>

      {isLoading ? <p>Preparing setup…</p> : null}
      <FlashToasts
        error={error}
        message={message}
        onClearError={() => setError(null)}
        onClearMessage={() => setMessage(null)}
      />

      {!isLoading && user ? (
        <p className="mfa-setup__account">
          {user.displayName} · {user.email}
        </p>
      ) : null}

      {recoveryCodes ? (
        <div className="mfa-setup__done">
          <h2>Recovery codes</h2>
          <p>Store these recovery codes securely. Each code can be used once.</p>
          <ul className="mfa-setup__codes">
            {recoveryCodes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setRecoveryCodes(null)}>
            Continue
          </Button>
        </div>
      ) : null}

      {mfaEnabled && !recoveryCodes && !resetMode ? (
        <form className="auth-form" onSubmit={(event) => void handleDisable(event)}>
          <Alert variant="info">Enter the current authenticator code to turn MFA off. Demo code: 123456</Alert>
          <FormField label="MFA code" htmlFor="mfa-disable-code">
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

      {(!isLoading && (!mfaEnabled || resetMode) && secret && !recoveryCodes) ? (
        <form className="auth-form" onSubmit={(event) => void handleEnable(event)}>
          <Alert variant="info">
            {resetMode ? 'Reset' : 'Secret'}: <code>{secret}</code>
            <br />
            URI: <code>{otpauthUri}</code>
            <br />
            Demo MFA code: 123456
          </Alert>
          <FormField label="MFA code" htmlFor="mfa-setup-code">
            <MfaCodeInput
              id="mfa-setup-code"
              value={code}
              onChange={setCode}
              disabled={isSubmitting}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting || code.length !== 6}>
            {isSubmitting ? 'Confirming…' : resetMode ? 'Reset MFA' : 'Enable MFA'}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
