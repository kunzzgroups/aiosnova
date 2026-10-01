import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/layouts/AuthLayout'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { useMfaChallenge } from '@/modules/core/auth/hooks/useMfaChallenge'
import './AuthForm.css'

export function MfaChallengePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { mfaTicket, handleVerify, isSubmitting, error } = useMfaChallenge()
  const [code, setCode] = useState('')

  useEffect(() => {
    if (!mfaTicket) {
      navigate('/login', { replace: true })
    }
  }, [mfaTicket, navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await handleVerify(code)
  }

  if (!mfaTicket) {
    return null
  }

  return (
    <AuthLayout
      title={t('auth.twoFactorTitle')}
      subtitle={t('auth.twoFactorSubtitle')}
      footer={
        <p>
          <Link to="/login">{t('auth.backToSignIn')}</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Alert variant="info">{t('auth.demoMfaCode')}</Alert>
        <FormField label={t('auth.verificationCode')} htmlFor="mfa-code">
          <MfaCodeInput
            id="mfa-code"
            value={code}
            onChange={setCode}
            hasError={Boolean(error)}
            disabled={isSubmitting}
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting || code.length !== 6}>
          {isSubmitting ? t('auth.verifying') : t('auth.verify')}
        </Button>
      </form>
    </AuthLayout>
  )
}
