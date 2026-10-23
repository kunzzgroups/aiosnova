import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { InvitationActivationPage } from '@/modules/core/auth/pages/InvitationActivationPage'
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
import { AiAssistantPage } from '@/modules/ai/assistant/pages/AiAssistantPage'
import { AgentsPage } from '@/modules/ai/agents/pages/AgentsPage'
import { KnowledgeBasesPage } from '@/modules/ai/knowledge/pages/KnowledgeBasesPage'
import { KnowledgeBaseDetailPage } from '@/modules/ai/knowledge/pages/KnowledgeBaseDetailPage'
import { TemplatesPage } from '@/modules/ai/knowledge/pages/TemplatesPage'
import { AiSettingsPage } from '@/modules/ai/settings/pages/AiSettingsPage'
import { ProvidersPage } from '@/modules/ai/settings/pages/ProvidersPage'
import { ToolsPage } from '@/modules/ai/settings/pages/ToolsPage'
import { ToolDetailPage } from '@/modules/ai/settings/pages/ToolDetailPage'
import { McpPage } from '@/modules/ai/settings/pages/McpPage'
import { SecurityLimitsPage } from '@/modules/ai/settings/pages/SecurityLimitsPage'
import { UsageCostPage } from '@/modules/ai/settings/pages/UsageCostPage'
import { ProviderModelsPage } from '@/modules/ai/settings/pages/ProviderModelsPage'
import { CompanyModelsPage } from '@/modules/ai/settings/pages/CompanyModelsPage'
import { UsersPage } from '@/modules/core/identity/pages/UsersPage'
import { UserDetailPage } from '@/modules/core/identity/pages/UserDetailPage'
import { OrganizationPage } from '@/modules/core/identity/pages/OrganizationPage'
import { OrganizationRoute } from '@/modules/core/identity/OrganizationRoute'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'
import { RolesAndAccessPage } from '@/modules/core/identity/pages/RolesAndAccessPage'

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

        <Route path="/activate" element={<InvitationActivationPage />} />
        <Route path="/mfa/challenge" element={<MfaChallengePage />} />
        <Route path="/oauth/:provider/callback" element={<OAuthCallbackPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/mfa/setup" element={<MfaSetupPage />} />

            <Route path="/ai/ai/ai-assistant" element={<AiAssistantPage />} />
            <Route path="/ai/ai/ai-agents" element={<AgentsPage />} />

            <Route path="/ai/ai/knowledge" element={<KnowledgeBasesPage />} />
            {/* Templates route MUST come before :baseId, otherwise
                "templates" is captured as a baseId. */}
            <Route
              path="/ai/ai/knowledge/templates"
              element={<TemplatesPage />}
            />
            <Route
              path="/ai/ai/knowledge/:baseId"
              element={<KnowledgeBaseDetailPage />}
            />
            <Route
              path="/ai/ai/knowledge/:baseId/:tab"
              element={<KnowledgeBaseDetailPage />}
            />

            {/* AI Settings — Phase 1 (FE-04 ~ FE-07)
                The base path intentionally matches sidebarNav's generated
                "AI Settings" path: /ai/ai/ai-settings. */}
            <Route
              path="/ai/ai/ai-settings"
              element={<AiSettingsPage />}
            />
            <Route path="/ai/ai/ai-settings/models" element={<CompanyModelsPage />} />
            <Route
              path="/ai/ai/ai-settings/models/providers"
              element={<ProvidersPage />}
            />
            <Route
              path="/ai/ai/ai-settings/models/providers/:providerId/models"
              element={<ProviderModelsPage />}
            />

            <Route path="/ai/ai/ai-settings/tools" element={<ToolsPage />} />
            <Route path="/ai/ai/ai-settings/mcp" element={<McpPage />} />
            <Route path="/ai/ai/ai-settings/security-limits" element={<SecurityLimitsPage />} />
            <Route path="/ai/ai/ai-settings/usage-cost" element={<UsageCostPage />} />
            <Route path="/ai/ai/ai-settings/tools/:toolId" element={<ToolDetailPage />} />

            <Route path="/system/core/employees" element={<UsersPage />} />
            <Route
              path="/system/core/employees/:userId"
              element={<UserDetailPage />}
            />
            <Route element={<OrganizationRoute />}>
              <Route
                path="/system/core/organization"
                element={<OrganizationPage />}
              />
            </Route>
            <Route path="/system/core/roles-and-access" element={<RolesAndAccessPage />} />
            <Route path="/system/core/activity" element={<ModulePlaceholderPage />} />

            <Route path="*" element={<ModulePlaceholderPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

