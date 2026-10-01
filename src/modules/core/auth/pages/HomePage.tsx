import { useTranslation } from 'react-i18next'
import { useSession } from '@/modules/core/auth/hooks/useSession'
import './HomePage.css'

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useSession()

  return (
    <section className="home-page">
      <h1>{t('home.welcome', { name: user?.name ?? '' })}</h1>
      <p>{t('home.mockSession')}</p>
      <dl className="home-page__meta">
        <div>
          <dt>{t('home.email')}</dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt>{t('home.mfa')}</dt>
          <dd>{user?.mfaEnabled ? t('home.enabled') : t('home.disabled')}</dd>
        </div>
        <div>
          <dt>{t('home.accessToken')}</dt>
          <dd>{t('home.accessTokenValue')}</dd>
        </div>
        <div>
          <dt>{t('home.refresh')}</dt>
          <dd>{t('home.refreshValue')}</dd>
        </div>
      </dl>
    </section>
  )
}
