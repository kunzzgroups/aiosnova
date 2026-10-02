import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from '@/components/navigation/Sidebar'
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

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__workspace">
        <header className="app-shell__header">
          <div className="app-shell__header-title">{t('shell.workspace')}</div>
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
