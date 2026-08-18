import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'

export function LoginPage() {
  return (
    <AuthLayout title="Sign In" hideIcon>
      <LoginForm />
    </AuthLayout>
  )
}
