import { Link } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginForm } from '@/modules/core/auth/components/LoginForm'
import './AuthDemoHint.css'

export function LoginPage() {
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your AIOS workspace."
      footer={
        <>
          <p>
            No account yet? <Link to="/register">Create one</Link>
          </p>
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
