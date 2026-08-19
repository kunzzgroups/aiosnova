import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { useAuthCopy } from '@/modules/core/auth/i18n/authCopy'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { useLogin } from '@/modules/core/auth/hooks/useLogin'
import { readRememberedLogin } from '@/modules/core/auth/utils/rememberedLogin'
import {
  DEFAULT_PHONE_DIAL_CODE,
  PHONE_DIAL_CODES,
  composeDialedPhone,
} from '@/modules/core/auth/utils/phoneDialCodes'
import './LoginForm.css'

type LoginMethod = 'email' | 'phone'

function IconChevron() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <path d="M4 6.2 8 10l4-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LoginForm() {
  const { handleRequestTac, handleVerifyTac, isSubmitting, error, setError, setMessage } = useLogin()
  const { t } = useAuthCopy()
  const [remembered] = useState(readRememberedLogin)
  const [method, setMethod] = useState<LoginMethod>('email')
  const [email, setEmail] = useState(remembered?.email ?? '')
  const [dialCode, setDialCode] = useState(DEFAULT_PHONE_DIAL_CODE.prefix)
  const [dialOpen, setDialOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [tac, setTac] = useState('')
  const [tacSent, setTacSent] = useState(false)
  const [sendingTac, setSendingTac] = useState(false)
  const dialRef = useRef<HTMLDivElement>(null)
  const dialListId = useId()
  const selectedDial = PHONE_DIAL_CODES.find((item) => item.prefix === dialCode) ?? DEFAULT_PHONE_DIAL_CODE

  const fullPhone = composeDialedPhone(dialCode, phone).full
  const canSendOtp = method === 'email' ? Boolean(email.trim()) : Boolean(phone.trim())

  useEffect(() => {
    if (!dialOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!dialRef.current?.contains(event.target as Node)) {
        setDialOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDialOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dialOpen])

  function switchMethod(next: LoginMethod) {
    setDialOpen(false)
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
      method === 'email' ? await handleRequestTac({ email }) : await handleRequestTac({ phone: fullPhone })
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
    await handleVerifyTac({ phone: fullPhone, code: tac })
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
            <div className="login-form__phone">
              <div className="login-form__dial" ref={dialRef}>
                <button
                  type="button"
                  className={['login-form__dial-trigger', dialOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
                  aria-label={t('countryCode')}
                  aria-haspopup="listbox"
                  aria-expanded={dialOpen}
                  aria-controls={dialListId}
                  disabled={isSubmitting}
                  onClick={() => setDialOpen((current) => !current)}
                >
                  <span>{selectedDial.label}</span>
                  <span className="login-form__dial-chevron" aria-hidden>
                    <IconChevron />
                  </span>
                </button>
                {dialOpen ? (
                  <ul className="login-form__dial-menu" id={dialListId} role="listbox" aria-label={t('countryCode')}>
                    {PHONE_DIAL_CODES.map((option) => {
                      const selected = option.prefix === dialCode
                      return (
                        <li key={option.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={['login-form__dial-option', selected ? 'is-selected' : '']
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              setDialCode(option.prefix)
                              setDialOpen(false)
                            }}
                          >
                            <span>{option.label}</span>
                            {selected ? <span className="login-form__dial-check" aria-hidden /> : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
              <TextField
                id="login-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder={t('enterPhone')}
                value={phone}
                onChange={(event) => setPhone(composeDialedPhone(dialCode, event.target.value).local)}
                required
                disabled={isSubmitting}
              />
            </div>
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
