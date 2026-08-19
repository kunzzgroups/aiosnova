import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Sidebar } from '@/components/navigation/Sidebar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuthStore } from '@/stores/authStore'
import { logout } from '@/modules/core/auth/services/authService'
import './AppShell.css'

type AppShellProps = {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const user = useAuthStore((state) => state.user)

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__workspace">
        <header className="app-shell__header">
          <div className="app-shell__header-title">Workspace</div>
          <div className="app-shell__actions">
            <span className="app-shell__user">{user?.email}</span>
            <ThemeToggle />
            <Link to={user ? `/mfa/setup?userId=${user.id}` : '/mfa/setup'}>Manage MFA</Link>
            <Button variant="secondary" size="md" onClick={() => void handleLogout()}>
              Log out
            </Button>
          </div>
        </header>
        <main className="app-shell__main">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}
