import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { logout } from '@/modules/core/auth/services/authService'
import './AppShell.css'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const user = useAuthStore((state) => state.user)

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link to="/" className="app-shell__brand">
          AIOS
        </Link>
        <div className="app-shell__actions">
          <span className="app-shell__user">{user?.email}</span>
          <Link to="/mfa/setup">MFA setup</Link>
          <Button variant="secondary" size="md" onClick={() => void handleLogout()}>
            Log out
          </Button>
        </div>
      </header>
      <main className="app-shell__main">{children}</main>
    </div>
  )
}
