import { useState, useEffect type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
// import { useTranslation } from 'react-i18next'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { useLogin } from '@/modules/core/auth/hooks/useLogin'
import { readRememberedLogin } from '@/modules/core/auth/utils/rememberedLogin'
import './LoginForm.css'

/**
 * Email sign-in only.
 *
 * The mobile flow (method tabs + dial-code picker + phone OTP) was removed.
 * The service layer still accepts an optional `phone` payload in
 * `authService.requestLoginTac` - that is the API contract and is kept.
 */
export function LoginForm() {
  const { handleRequestTac, handleVerifyTac, isSubmitting, error } = useLogin()
  const { t } = useTranslation()
  const [remembered] = useState(readRememberedLogin)
  const [email, setEmail] = useState(remembered?.email ?? '')
  const [tac, setTac] = useState('')
  const [tacSent, setTacSent] = useState(false)
  const [sendingTac, setSendingTac] = useState(false)

  const canSendOtp = Boolean(email.trim())
//Resend Tac Cooldown
  const[resendCooldown, setResendCooldown] = useState(0)

  useEffect(()=> {
    if (resendCooldown <= 0){
    return
  }

  const timer =setInterval(() =>{
    setResendCooldown((current) => current-1)
  }, 1000)

  return () => clearInterval(timer)
}, [resendCooldown])

  async function sendTac() {
    if (!canSendOtp || sendingTac || isSubmitting) {
      return
    }
    setSendingTac(true)
    const sent = await handleRequestTac({ email })
    setSendingTac(false)
    if (sent) {
      setTacSent(true)
      setResendCooldown(60)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleVerifyTac({ email, code: tac })
  }

  return (
    <div className="login-form">
      <form className="login-form__form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <FormField label={t('auth.email')} htmlFor="login-email">
          <TextField
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('auth.enterEmail')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label={t('auth.emailCode')} htmlFor="login-tac">
          <div className="login-form__tac">
            <TextField
              id="login-tac"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t('auth.enterEmailCode')}
              value={tac}
              onChange={(event) => setTac(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="login-form__tac-send"
              onClick={() => void sendTac()}
              disabled={sendingTac || isSubmitting || !canSendOtp || resendCooldown > 0}
            >
              {sendingTac ? t('auth.sendingTac') :resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : tacSent ? t('auth.resendTac') : t('auth.sendTac')}
            </button>
          </div>
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
          {isSubmitting ? t('auth.signingIn') : t('auth.signInButton')}
        </Button>
      </form>

      <div className="login-form__divider">
        <span>{t('auth.orSignInWith')}</span>
      </div>
      <SocialAuthButtons />
    </div>
  )
}
