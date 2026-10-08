import { createContext, useMemo, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sidebar } from '@/components/navigation/Sidebar'
import { findNavItemByPath } from '@/navigation/sidebarNav'
import { useNavLabel } from '@/i18n/useNavLabel'
import { LanguageSwitcher } from '@/components/navigation/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ModuleTabs } from './ModuleTabs'
import { CompanyTabs } from './CompanyTabs'
import './AppShell.css'

type PageHeader = { titleKey: string; descriptionKey: string } | null
export const AppShellHeaderContext = createContext<(header: PageHeader) => void>(() => {})

type AppShellProps = {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation()
  const [header,setHeader] = useState<PageHeader>(null)
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
    <AppShellHeaderContext.Provider value={setHeader}>
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__workspace">
        <header className="app-shell__header">
          <div className="app-shell__header-copy">
            <div className="app-shell__header-title">{header ? t(header.titleKey) : pageTitle}</div>
            {header ? <p className="app-shell__header-description">{t(header.descriptionKey)}</p> : null}
          </div>
          <div className="app-shell__actions">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <CompanyTabs />
        <ModuleTabs />
        <main className="app-shell__main">{children ?? <Outlet />}</main>
      </div>
    </div>
    </AppShellHeaderContext.Provider>
  )
}
