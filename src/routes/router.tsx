import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute } from '@/routes/GuestRoute'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { AppShell } from '@/layouts/AppShell'
import { LoginPage } from '@/modules/core/auth/pages/LoginPage'
import { ForgotPasswordPage } from '@/modules/core/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/modules/core/auth/pages/ResetPasswordPage'
import { MfaChallengePage } from '@/modules/core/auth/pages/MfaChallengePage'
import { MfaSetupPage } from '@/modules/core/auth/pages/MfaSetupPage'
import { OAuthCallbackPage } from '@/modules/core/auth/pages/OAuthCallbackPage'
import { HomePage } from '@/modules/core/auth/pages/HomePage'
import { UsersPage } from '@/modules/core/identity/pages/UsersPage'
import { UserDetailPage } from '@/modules/core/identity/pages/UserDetailPage'
import { CompaniesPage } from '@/modules/core/identity/pages/CompaniesPage'
import { CompanyDetailPage } from '@/modules/core/identity/pages/CompanyDetailPage'
import { OrganizationPage } from '@/modules/core/identity/pages/OrganizationPage'
import { PositionsPage } from '@/modules/core/identity/pages/PositionsPage'
import { MembershipsPage } from '@/modules/core/identity/pages/MembershipsPage'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route path="/mfa/challenge" element={<MfaChallengePage />} />
        <Route path="/oauth/:provider/callback" element={<OAuthCallbackPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/mfa/setup" element={<MfaSetupPage />} />
            <Route path="/system/core/users" element={<UsersPage />} />
            <Route path="/system/core/users/:userId" element={<UserDetailPage />} />
            <Route path="/system/core/companies" element={<CompaniesPage />} />
            <Route path="/system/core/companies/:companyId" element={<CompanyDetailPage />} />
            <Route path="/system/core/organization" element={<OrganizationPage />} />
            <Route path="/system/core/position" element={<PositionsPage />} />
            <Route path="/system/core/membership" element={<MembershipsPage />} />
            <Route path="*" element={<ModulePlaceholderPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
