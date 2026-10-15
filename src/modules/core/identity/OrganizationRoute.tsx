import { Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useOrganizationAccess } from './OrganizationAccess'

export function OrganizationRoute() {
  const { t } = useTranslation()
  const { canRead,isLoading } = useOrganizationAccess()

  if (isLoading) {
    return <div className="auth-loading" role="status">{t('common.loading')}</div>
  }

  if (!canRead) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
