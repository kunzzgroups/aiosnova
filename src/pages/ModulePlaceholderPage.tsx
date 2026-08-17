import { useLocation } from 'react-router-dom'
import { findSidebarLabelByPath } from '@/navigation/sidebarNav'
import './ModulePlaceholderPage.css'

export function ModulePlaceholderPage() {
  const location = useLocation()
  const label = findSidebarLabelByPath(location.pathname) ?? 'Module'

  return (
    <section className="module-placeholder">
      <p className="module-placeholder__eyebrow">AIOS Module</p>
      <h1>{label}</h1>
      <p>
        This screen is wired from the sidebar information architecture. Content for{' '}
        <code>{location.pathname}</code> will be implemented in its domain module.
      </p>
    </section>
  )
}
