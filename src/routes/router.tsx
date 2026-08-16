import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute } from '@/routes/GuestRoute'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { LoginPage } from '@/modules/core/auth/pages/LoginPage'
import { RegisterPage } from '@/modules/core/auth/pages/RegisterPage'
import { ForgotPasswordPage } from '@/modules/core/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/core/auth/pages/ResetPasswordPage'
import { MfaChallengePage } from '@/modules/core/auth/pages/MfaChallengePage'
import { MfaSetupPage } from '@/modules/core/auth/pages/MfaSetupPage'
import { GoogleOAuthCallbackPage } from '@/modules/core/auth/pages/GoogleOAuthCallbackPage'
import { HomePage } from '@/modules/core/auth/pages/HomePage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route path="/mfa/challenge" element={<MfaChallengePage />} />
        <Route path="/oauth/google/callback" element={<GoogleOAuthCallbackPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/mfa/setup" element={<MfaSetupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
