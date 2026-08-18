import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'
import './AuthDemoHint.css'

export function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email account opened for you in Core."
      footer={
        <div className="auth-demo-hint">
          <p>Demo accounts opened in Core</p>
          <ul>
            <li>demo@aios.dev / Password1!</li>
            <li>mfa@aios.dev / Password1! (code 123456)</li>
          </ul>
        </div>
      }
    >
      <LoginForm />
    </AuthLayout>
  )
}
