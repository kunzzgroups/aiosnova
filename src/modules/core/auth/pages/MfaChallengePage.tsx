import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconShield } from '@/components/icons/Icons'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/layouts/AuthLayout'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { useMfaChallenge } from '@/modules/core/auth/hooks/useMfaChallenge'
import './AuthForm.css'
import './MfaChallengePage.css'

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
      hideIcon
      footer={
        <p>
          <Link to="/login">{t('auth.backToSignIn')}</Link>
        </p>
      }
    >
      <header className="mfa-challenge__header">
        <span className="mfa-challenge__icon" aria-hidden="true"><IconShield /></span>
        <h1>{t('auth.mfaChallengeTitle')}</h1>
        <p>{t('auth.mfaChallengeSubtitle')}</p>
      </header>
      <form className="auth-form mfa-challenge" onSubmit={(event) => void handleSubmit(event)}>
        <FormField label={t('auth.verificationCode')} htmlFor="mfa-code"
          error={error ?? undefined} hint={t('auth.mfaLatestCodeHint')}>
          <MfaCodeInput
            id="mfa-code"
            value={code}
            onChange={setCode}
            hasError={Boolean(error)}
            disabled={isSubmitting}
            segmented
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting || code.length !== 6}>
          {isSubmitting ? t('auth.verifying') : t('auth.mfaVerifyContinue')}
        </Button>
      </form>
    </AuthLayout>
  )
}
