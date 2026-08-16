import { AppShell } from '@/layouts/AppShell'
import { useSession } from '@/modules/core/auth/hooks/useSession'
import './HomePage.css'

export function HomePage() {
  const { user } = useSession()

  return (
    <AppShell>
      <section className="home-page">
        <h1>Welcome, {user?.name}</h1>
        <p>You are signed in to AIOS with a mock authenticated session.</p>
        <dl className="home-page__meta">
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>MFA</dt>
            <dd>{user?.mfaEnabled ? 'Enabled' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Access token</dt>
            <dd>Stored in memory only (not localStorage)</dd>
          </div>
          <div>
            <dt>Refresh</dt>
            <dd>HttpOnly cookie via MSW + CSRF header on refresh/logout</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  )
}
