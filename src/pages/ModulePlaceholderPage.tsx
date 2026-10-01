import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { findSidebarLabelByPath } from '@/navigation/sidebarNav'
import './ModulePlaceholderPage.css'

export function ModulePlaceholderPage() {
  const location = useLocation()
  const { t } = useTranslation()
  const label = findSidebarLabelByPath(location.pathname) ?? t('placeholder.fallbackLabel')

  return (
    <section className="module-placeholder">
      <p className="module-placeholder__eyebrow">{t('placeholder.eyebrow')}</p>
      <h1>{label}</h1>
      <p>
        {t('placeholder.description')}{' '}
        <code>{location.pathname}</code> {t('placeholder.descriptionTail')}
      </p>
    </section>
  )
}
