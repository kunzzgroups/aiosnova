import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'
import './AuthDemoHint.css'

export function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email account issued by CORE. Social sign-in is not available."
      footer={
        <>
          <p>Need an account? Ask a CORE administrator to invite you.</p>
          <div className="auth-demo-hint">
            <p>Demo accounts</p>
            <ul>
              <li>demo@aios.dev / Password1!</li>
              <li>mfa@aios.dev / Password1! (code 123456)</li>
            </ul>
          </div>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  )
}
