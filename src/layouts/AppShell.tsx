import { useMemo, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from '@/components/navigation/Sidebar'
import { findNavItemByPath } from '@/navigation/sidebarNav'
import { useNavLabel } from '@/i18n/useNavLabel'
import { LanguageSwitcher } from '@/components/navigation/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuthStore } from '@/stores/authStore'
import { ModuleTabs } from './ModuleTabs'
import { CompanyTabs } from './CompanyTabs'
import './AppShell.css'

type AppShellProps = {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const user = useAuthStore((state) => state.user)
  const { t } = useTranslation()
  const location = useLocation()
  const navLabel = useNavLabel()

  /**
   * The header names the page you are on, taken from the same sidebar entry that
   * put you there - so header, sidebar and module tabs can never drift apart.
   * Routes that no sidebar entry owns (MFA setup, the home page) keep the
   * generic workspace label.
   */
  const pageTitle = useMemo(() => {
    const item = findNavItemByPath(location.pathname)
    return item ? navLabel(item) : t('shell.workspace')
  }, [location.pathname, navLabel, t])

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__workspace">
        <header className="app-shell__header">
          <div className="app-shell__header-title">{pageTitle}</div>
          <div className="app-shell__actions">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link to={user ? `/mfa/setup?userId=${user.id}` : '/mfa/setup'}>{t('shell.manageMfa')}</Link>
          </div>
        </header>
        <CompanyTabs />
        <ModuleTabs />
        <main className="app-shell__main">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}
