import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { ApiError } from '@/services/httpClient'
import { resetPassword } from '@/modules/core/auth/services/authService'
import {
  isValidPassword,
  PASSWORD_CONFIRM_PLACEHOLDER,
  PASSWORD_CREATE_PLACEHOLDER,
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
} from '@/modules/core/auth/utils/passwordPolicy'
import './AuthForm.css'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const confirmPasswordMismatch = confirmPassword.length > 0 && confirmPassword !== password

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!token) {
      setError('Reset link is invalid or expired.')
      return
    }

    if (!isValidPassword(password)) {
      setError(PASSWORD_ERROR_MESSAGE)
      return
    }

    if (password !== confirmPassword) {
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword({ token, password })
      navigate('/login')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Choose a new password for your account."
      footer={
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {!token ? <Alert variant="error">Missing reset token. Request a new link.</Alert> : null}
        <FormField label="New password" htmlFor="reset-password">
          <PasswordField
            id="reset-password"
            value={password}
            onChange={setPassword}
            placeholder={PASSWORD_CREATE_PLACEHOLDER}
            autoComplete="new-password"
            showRequirements
            disabled={isSubmitting || !token}
          />
        </FormField>
        <FormField
          label="Confirm password"
          htmlFor="reset-confirm"
          error={confirmPasswordMismatch ? PASSWORD_MISMATCH_MESSAGE : undefined}
        >
          <PasswordField
            id="reset-confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={PASSWORD_CONFIRM_PLACEHOLDER}
            autoComplete="new-password"
            hasError={confirmPasswordMismatch}
            disabled={isSubmitting || !token}
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting || !token}>
          {isSubmitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
