import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PasswordField } from '@/modules/core/auth/components/PasswordField'
import { ApiError } from '@/services/httpClient'
import { resetPassword } from '@/modules/core/auth/services/authService'
import { isValidPassword } from '@/modules/core/auth/utils/passwordPolicy'
import './AuthForm.css'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
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
      setError(t('auth.resetLinkInvalid'))
      return
    }

    if (!isValidPassword(password)) {
      setError(t('auth.passwordPolicyError'))
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
      setError(err instanceof ApiError ? err.message : t('auth.resetFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.resetPasswordTitle')}
      subtitle={t('auth.resetPasswordSubtitle')}
      footer={
        <p>
          <Link to="/login">{t('auth.backToSignIn')}</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {!token ? <Alert variant="error">{t('auth.missingResetToken')}</Alert> : null}
        <FormField label={t('auth.newPassword')} htmlFor="reset-password">
          <PasswordField
            id="reset-password"
            value={password}
            onChange={setPassword}
            placeholder={t('auth.passwordCreatePlaceholder')}
            autoComplete="new-password"
            showRequirements
            disabled={isSubmitting || !token}
          />
        </FormField>
        <FormField
          label={t('auth.confirmPassword')}
          htmlFor="reset-confirm"
          error={confirmPasswordMismatch ? t('auth.passwordMismatch') : undefined}
        >
          <PasswordField
            id="reset-confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={t('auth.passwordConfirmPlaceholder')}
            autoComplete="new-password"
            hasError={confirmPasswordMismatch}
            disabled={isSubmitting || !token}
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting || !token}>
          {isSubmitting ? t('auth.updating') : t('auth.updatePassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
