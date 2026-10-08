import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { IconSend, IconShield } from '@/components/icons/Icons'
import { AuthLayout } from '@/layouts/AuthLayout'
import { activateInvitation, fetchInvitation, logout, startInvitationMfa } from '@/modules/core/auth/services/authService'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import type { InvitationDetails, InvitationMfaSetup } from '@/modules/core/auth/types/auth'
import { ApiError } from '@/services/httpClient'
import { useAuthStore } from '@/stores/authStore'
import './AuthForm.css'
import './InvitationActivationPage.css'

export function InvitationActivationPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [failed, setFailed] = useState(false)
  const [setup, setSetup] = useState<InvitationMfaSetup | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activated, setActivated] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)

  useEffect(() => {
    let current = true
    setInvitation(null)
    setFailed(false)
    setSetup(null)
    setCode('')
    setError(null)
    setActivated(false)
    fetchInvitation(token).then(result => {
      if (current) setInvitation(result)
    }).catch(() => {
      if (current) setFailed(true)
    })
    return () => { current = false }
  }, [token])

  function showError(err: unknown) {
    setError(t(err instanceof ApiError && err.status === 401 ? 'auth.invitationCodeInvalid'
      : err instanceof ApiError && err.status === 429 ? 'auth.invitationAttemptsExceeded'
      : 'auth.invitationActionFailed'))
  }

  async function startMfa() {
    setBusy(true)
    setError(null)
    try {
      setSetup(await startInvitationMfa(token))
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await activateInvitation(token, code)
      setActivated(true)
      setSetup(null)
      setCode('')
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    setBusy(true)
    try {
      if (useAuthStore.getState().accessToken) await logout()
      navigate('/login')
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  const welcome = Boolean(invitation && !setup && !activated)

  return (
    <AuthLayout title={welcome ? undefined : t(setup ? 'auth.invitationSetupTitle' : 'auth.invitationTitle')}
      subtitle={setup ? t('auth.invitationSetupSubtitle') : undefined}
      inlineControls={Boolean(setup)}
      headerDetails={setup && invitation ? <p className="invitation-setup-email">{t('auth.invitationSettingUpFor', { email: invitation.email })}</p> : null}
      hideIcon wide={Boolean(setup)}>
      <div className={`auth-form-stack invitation-activation${welcome ? ' invitation-activation--welcome' : ''}`}>
        {failed ? <Alert variant="error">{t('auth.invitationUnavailable')}</Alert> : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
        {!failed && !invitation ? <p>{t('auth.invitationLoading')}</p> : null}
        {invitation ? <>
          {welcome ? <header className="invitation-welcome">
            <span className="invitation-welcome__icon"><IconSend /></span>
            <h1>{t('auth.invitationWelcomeTitle')}</h1>
            <p>{t('auth.invitationJoinCompanies', { companies: invitation.companies.join(', ') })}</p>
          </header> : null}
          {!setup ? <div className="invitation-account">
            <div className="invitation-account__field">
              <p className="invitation-account__label">{t('auth.invitationEmailLabel')}</p>
              <p className="invitation-account__email">{invitation.email}</p>
            </div>
            {!activated ? <div className="invitation-account__field">
              <p className="invitation-account__label">{t('auth.invitationAssignedCompanies')}</p>
              <p className="invitation-account__email">{invitation.companies.join(', ')}</p>
            </div> : null}
          </div> : null}
          {activated ? <>
            <Alert variant="success">{t('auth.invitationActivated')}</Alert>
            <Button disabled={busy} onClick={() => void signIn()}>{t('auth.invitationSignIn')}</Button>
          </> : <form className="auth-form" onSubmit={event => void activate(event)}>
            {!setup ? <div className="invitation-security">
              <IconShield />
              <div>
                <h2>{t('auth.invitationSecureTitle')}</h2>
                <p>{t(invitation.requireMfa ? 'auth.invitationSecureHint' : 'auth.invitationActivateHint')}</p>
              </div>
            </div> : null}
            {invitation.requireMfa && !setup ? (
              <Button type="button" fullWidth disabled={busy} onClick={() => void startMfa()}>
                {t(busy ? 'auth.preparingSetup' : 'auth.invitationSetupContinue')}
              </Button>
            ) : setup ? <div className="invitation-mfa">
              <aside className="invitation-mfa__scan" aria-labelledby="activation-scan-title">
                <h2 id="activation-scan-title"><span className="invitation-mfa__step">1</span><span>{t('auth.invitationScanTitle')}</span></h2>
                <p>{t('auth.invitationScanQr')}</p>
                <div className="invitation-mfa__qr">
                  <img width="240" height="240" alt={t('auth.invitationQrAlt')}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrCodeSvg)}`} />
                </div>
                <details className="invitation-mfa__manual">
                  <summary>{t('auth.invitationCantScan')}</summary>
                  <div className="invitation-mfa__secret">
                    <p>{t('auth.invitationManualSecret')}</p>
                    <code>{setup.secret}</code>
                    <Button variant="secondary" onClick={async () => {
                      await navigator.clipboard.writeText(setup.secret)
                      setSecretCopied(true)
                    }}>{t(secretCopied ? 'auth.invitationKeyCopied' : 'auth.invitationCopyKey')}</Button>
                  </div>
                </details>
              </aside>
              <section className="invitation-mfa__verify" aria-labelledby="activation-verify-title">
                <div className="invitation-mfa__intro">
                  <h2 id="activation-verify-title"><span className="invitation-mfa__step">2</span><span>{t('auth.invitationVerifyTitle')}</span></h2>
                  <p>{t('auth.invitationVerifyHint')}</p>
                </div>
                <FormField label={t('auth.invitationVerificationCode')} htmlFor="activation-mfa-code">
                  <div className="invitation-mfa__code">
                    <div className="invitation-mfa__digits" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => <span key={index}>{code[index] || '–'}</span>)}
                    </div>
                  <MfaCodeInput id="activation-mfa-code" value={code} onChange={setCode} disabled={busy}
                    hasError={Boolean(error)} />
                  </div>
                </FormField>
                <Button type="submit" fullWidth disabled={busy || code.length !== 6}>
                  {t(busy ? 'auth.invitationActivating' : 'auth.invitationVerifyActivate')}
                </Button>
              </section>
            </div> : (
              <Button type="submit" fullWidth disabled={busy || (invitation.requireMfa && code.length !== 6)}>
                {t(busy ? 'auth.invitationActivating' : 'auth.invitationActivate')}
              </Button>
            )}
          </form>}
          {!activated ? <p className="invitation-expiry" title={new Date(invitation.expiresAt).toLocaleString(i18n.language)}>{t('auth.invitationExpires', {
            date: new Date(invitation.expiresAt).toLocaleDateString(i18n.language, {
              day: 'numeric', month: 'short', year: 'numeric',
            }),
          })}</p> : null}
        </> : null}
      </div>
    </AuthLayout>
  )
}
