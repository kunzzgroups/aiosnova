import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { findModuleByPath } from '@/navigation/sidebarNav'
import { useNavLabel } from '@/i18n/useNavLabel'
import './TopTabs.css'
import { useOrganizationAccess } from '@/modules/core/identity/OrganizationAccess'

/**
 * Secondary navigation for the module the current route belongs to.
 * Renders a full-width tab strip directly under the app header.
 */
export function ModuleTabs() {
  const location = useLocation()
  const { canRead }=useOrganizationAccess()
  const { t } = useTranslation()
  const navLabel = useNavLabel()
  const match = useMemo(() => findModuleByPath(location.pathname), [location.pathname])

  if (!match) {
    return null
  }

  return (
    <nav className="top-tabs" aria-label={t('sidebar.moduleSections', { module: navLabel(match.module) })}>
      <div className="top-tabs__inner">
        {match.items.filter(item=>canRead||!item.path.endsWith('/organization')).map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              ['top-tabs__tab', isActive ? 'top-tabs__tab--active' : ''].filter(Boolean).join(' ')
            }
          >
            {navLabel(item)}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
