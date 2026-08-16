import { useAuthStore } from '@/stores/authStore'
import { logout } from '@/modules/core/auth/services/authService'

export function useSession() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)

  return {
    accessToken,
    user,
    isAuthenticated: Boolean(accessToken && user),
    isHydrated,
    logout,
  }
}
