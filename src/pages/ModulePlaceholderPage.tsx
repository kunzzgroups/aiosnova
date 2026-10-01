import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './ModulePlaceholderPage.css'

/**
 * Fallback page for sidebar routes that have no screen yet. The page name is not
 * repeated here: the app header already shows it (both read the same sidebar
 * label), so an `<h1>` would be pure duplication.
 */
export function ModulePlaceholderPage() {
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <section className="module-placeholder">
      <p className="module-placeholder__eyebrow">{t('placeholder.eyebrow')}</p>
      <p>
        {t('placeholder.description')}{' '}
        <code>{location.pathname}</code> {t('placeholder.descriptionTail')}
      </p>
    </section>
  )
}
