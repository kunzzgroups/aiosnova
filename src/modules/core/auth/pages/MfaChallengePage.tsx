import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { AuthLayout } from '@/layouts/AuthLayout'
import { MfaCodeInput } from '@/modules/core/auth/components/MfaCodeInput'
import { useMfaChallenge } from '@/modules/core/auth/hooks/useMfaChallenge'
import './AuthForm.css'

export function MfaChallengePage() {
  const navigate = useNavigate()
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
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
      footer={
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Alert variant="info">Demo MFA code: 123456</Alert>
        <FormField label="Verification code" htmlFor="mfa-code">
          <MfaCodeInput
            id="mfa-code"
            value={code}
            onChange={setCode}
            hasError={Boolean(error)}
            disabled={isSubmitting}
          />
        </FormField>
        <Button type="submit" fullWidth size="lg" disabled={isSubmitting || code.length !== 6}>
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </Button>
      </form>
    </AuthLayout>
  )
}
