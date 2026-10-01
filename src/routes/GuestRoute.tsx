import { Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/modules/core/auth/hooks/useSession'

export function GuestRoute() {
  const { t } = useTranslation()
  const { isAuthenticated, isHydrated } = useSession()

  if (!isHydrated) {
    return <div className="auth-loading">{t('common.loadingSession')}</div>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
