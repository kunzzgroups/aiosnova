import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/modules/core/auth/hooks/useSession'

export function GuestRoute() {
  const { isAuthenticated, isHydrated } = useSession()

  if (!isHydrated) {
    return <div className="auth-loading">Loading session…</div>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
