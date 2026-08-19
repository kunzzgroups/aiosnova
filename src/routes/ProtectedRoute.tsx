import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/modules/core/auth/hooks/useSession'

export function ProtectedRoute() {
  const { isAuthenticated, isHydrated } = useSession()
  const location = useLocation()

  if (!isHydrated) {
    return <div className="auth-loading">Loading session…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
