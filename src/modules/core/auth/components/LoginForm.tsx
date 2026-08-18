import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { useAuthCopy } from '@/modules/core/auth/i18n/authCopy'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { useLogin } from '@/modules/core/auth/hooks/useLogin'
import {
  clearRememberedLogin,
  readRememberedLogin,
} from '@/modules/core/auth/utils/rememberedLogin'
import './LoginForm.css'

export function LoginForm() {
  const { handleLogin, isSubmitting, error } = useLogin()
  const { t } = useAuthCopy()
  const [remembered] = useState(readRememberedLogin)
  const [email, setEmail] = useState(remembered?.email ?? '')
  const [password, setPassword] = useState(remembered?.password ?? '')
  const [rememberMe, setRememberMe] = useState(Boolean(remembered))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleLogin(email, password, rememberMe)
  }

  function handleRememberChange(checked: boolean) {
    setRememberMe(checked)
    if (!checked) {
      clearRememberedLogin()
    }
  }

  return (
    <div className="login-form">
      <form className="login-form__form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
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
        <FormField label={t('password')} htmlFor="login-password">
          <PasswordField
            id="login-password"
            name="password"
            value={password}
            onChange={setPassword}
            placeholder={t('enterPassword')}
            disabled={isSubmitting}
          />
        </FormField>
        <div className="login-form__meta">
          <label className="login-form__remember" htmlFor="login-remember">
            <input
              id="login-remember"
              className="login-form__remember-input"
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => handleRememberChange(event.target.checked)}
              disabled={isSubmitting}
            />
            <span className="login-form__switch" aria-hidden>
              <span className="login-form__switch-thumb" />
            </span>
            <span className="login-form__remember-text">{t('rememberMe')}</span>
          </label>
          <Link to="/forgot-password">{t('forgotPassword')}</Link>
        </div>
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
