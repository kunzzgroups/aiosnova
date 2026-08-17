import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { SocialAuthButtons } from '@/modules/core/auth/components/SocialAuthButtons'
import { ApiError } from '@/services/httpClient'
import { register } from '@/modules/core/auth/services/authService'
import './AuthForm.css'

export function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsSubmitting(true)
    try {
      await register({ name, email, password })
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Make a new AIOS workspace account with email or social sign-up."
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <div className="auth-form-stack">
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {error ? <Alert variant="error">{error}</Alert> : null}
          <FormField label="Name" htmlFor="register-name">
            <TextField
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Email" htmlFor="register-email">
            <TextField
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Password" htmlFor="register-password" hint="At least 8 characters.">
            <PasswordField
              id="register-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="register-confirm">
            <PasswordField
              id="register-confirm"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              disabled={isSubmitting}
            />
          </FormField>
          <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Get Started'}
          </Button>
        </form>

        <div className="auth-form-divider">
          <span>Or sign up with</span>
        </div>
        <SocialAuthButtons />
      </div>
    </AuthLayout>
  )
}
