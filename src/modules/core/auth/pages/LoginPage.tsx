import { useTranslation } from 'react-i18next'
import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <AuthLayout hideIcon login title={t('auth.signInWithEmailTitle')}>
      <LoginForm />
    </AuthLayout>
  )
}
