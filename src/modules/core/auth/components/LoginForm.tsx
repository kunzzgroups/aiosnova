import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { useAuthCopy } from '@/modules/core/auth/i18n/authCopy'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { useLogin } from '@/modules/core/auth/hooks/useLogin'
import { readRememberedLogin } from '@/modules/core/auth/utils/rememberedLogin'
import './LoginForm.css'

type LoginMethod = 'email' | 'phone'

export function LoginForm() {
  const { handleRequestTac, handleVerifyTac, isSubmitting, error, setError, setMessage } = useLogin()
  const { t } = useAuthCopy()
  const [remembered] = useState(readRememberedLogin)
  const [method, setMethod] = useState<LoginMethod>('email')
  const [email, setEmail] = useState(remembered?.email ?? '')
  const [phone, setPhone] = useState('')
  const [tac, setTac] = useState('')
  const [tacSent, setTacSent] = useState(false)
  const [sendingTac, setSendingTac] = useState(false)

  const canSendOtp = method === 'email' ? Boolean(email.trim()) : Boolean(phone.trim())

  function switchMethod(next: LoginMethod) {
    setMethod(next)
    setError(null)
    setMessage(null)
    setTac('')
    setTacSent(false)
  }

  async function sendTac() {
    if (!canSendOtp || sendingTac || isSubmitting) {
      return
    }
    setSendingTac(true)
    const sent =
      method === 'email' ? await handleRequestTac({ email }) : await handleRequestTac({ phone })
    setSendingTac(false)
    if (sent) {
      setTacSent(true)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (method === 'email') {
      await handleVerifyTac({ email, code: tac })
      return
    }
    await handleVerifyTac({ phone, code: tac })
  }

  return (
    <div className="login-form">
      <div className="login-form__methods" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'email'}
          className={['login-form__method', method === 'email' ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => switchMethod('email')}
        >
          {t('emailLogin')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'phone'}
          className={['login-form__method', method === 'phone' ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => switchMethod('phone')}
        >
          {t('phoneLogin')}
        </button>
      </div>

      <form className="login-form__form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {method === 'email' ? (
          <FormField label={t('email')} htmlFor="login-email">
            <TextField
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t('enterEmail')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isSubmitting}
            />
          </FormField>
        ) : (
          <FormField label={t('phone')} htmlFor="login-phone">
            <TextField
              id="login-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder={t('enterPhone')}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              disabled={isSubmitting}
            />
          </FormField>
        )}
        <FormField label={method === 'email' ? t('emailCode') : t('tac')} htmlFor="login-tac">
          <div className="login-form__tac">
            <TextField
              id="login-tac"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={method === 'email' ? t('enterEmailCode') : t('enterTac')}
              value={tac}
              onChange={(event) => setTac(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="login-form__tac-send"
              onClick={() => void sendTac()}
              disabled={sendingTac || isSubmitting || !canSendOtp}
            >
              {sendingTac ? t('sendingTac') : tacSent ? t('resendTac') : t('sendTac')}
            </button>
          </div>
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
          {isSubmitting ? t('signingIn') : t('signInButton')}
        </Button>
      </form>

      <div className="login-form__divider">
        <span>{t('orSignInWith')}</span>
      </div>
      <SocialAuthButtons />
    </div>
  )
}
