import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/modules/core/auth/hooks/useSession'

export function ProtectedRoute() {
  const { t } = useTranslation()
  const { isAuthenticated, isHydrated } = useSession()
  const location = useLocation()

  if (!isHydrated) {
    return <div className="auth-loading">{t('common.loadingSession')}</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
