import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { useAuthCopy } from '@/modules/core/auth/i18n/authCopy'
import { ApiError } from '@/services/httpClient'
import { forgotPassword } from '@/modules/core/auth/services/authService'
import './AuthForm.css'

export function ForgotPasswordPage() {
  const { t } = useAuthCopy()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [demoToken, setDemoToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setDemoToken(null)
    setIsSubmitting(true)

    try {
      const result = await forgotPassword({ email })
      setMessage(result.message)
      if (result.demoResetToken) {
        setDemoToken(result.demoResetToken)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit request.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={t('forgotTitle')}
      subtitle={t('forgotSubtitle')}
      hideIcon
      footer={
        <p>
          {t('rememberedIt')} <Link to="/login">{t('backToSignIn')}</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}
        {demoToken ? (
          <Alert variant="info">
            {t('demoResetLink')}{' '}
            <Link to={`/reset-password?token=${encodeURIComponent(demoToken)}`}>{t('continueToReset')}</Link>
          </Alert>
        ) : null}
        <FormField label={t('email')} htmlFor="forgot-email">
          <TextField
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={isSubmitting}
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
          {isSubmitting ? t('sending') : t('sendResetLink')}
        </Button>
      </form>
    </AuthLayout>
  )
}
