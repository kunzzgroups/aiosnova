import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { useLogin } from '@/modules/core/auth/hooks/useLogin'
import {
  clearRememberedLogin,
  readRememberedLogin,
} from '@/modules/core/auth/utils/rememberedLogin'
import './LoginForm.css'

export function LoginForm() {
  const { handleLogin, isSubmitting, error } = useLogin()
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
        <FormField label="Email" htmlFor="login-email">
          <TextField
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Password" htmlFor="login-password">
          <PasswordField
            id="login-password"
            name="password"
            value={password}
            onChange={setPassword}
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
            <span className="login-form__remember-text">Remember me</span>
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Get Started'}
        </Button>
      </form>

      <div className="login-form__divider">
        <span>Or sign in with</span>
      </div>
      <SocialAuthButtons />
    </div>
  )
}
