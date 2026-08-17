import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/modules/core/auth/hooks/useSession'

export function ProtectedRoute() {
  const { isAuthenticated, isHydrated, user } = useSession()
  const location = useLocation()

  if (!isHydrated) {
    return <div className="auth-loading">Loading session…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const needsProfile = user && !user.profileComplete
  const onCompleteProfile = location.pathname === '/profile/complete'

  if (needsProfile && !onCompleteProfile) {
    return <Navigate to="/profile/complete" replace />
  }

  if (!needsProfile && onCompleteProfile) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
