import { AuthLayout } from '@/layouts/AuthLayout'
import { useAuthCopy } from '@/modules/core/auth/i18n/authCopy'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'

export function LoginPage() {
  const { t } = useAuthCopy()
  return (
    <AuthLayout title={t('signInTitle')} hideIcon>
      <LoginForm />
    </AuthLayout>
  )
}
