import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { LanguageSwitcher } from '@/components/navigation/LanguageSwitcher'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import './AuthLayout.css'

type AuthLayoutProps = {
  title?: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  compact?: boolean
  hideIcon?: boolean
  login?: boolean
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide = false,
  compact = false,
  hideIcon = false,
  login = false,
}: AuthLayoutProps) {
  const panelClass = [
    'auth-layout__panel',
    wide ? 'auth-layout__panel--wide' : '',
    compact ? 'auth-layout__panel--compact' : '',
    login ? 'auth-layout__panel--login' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="auth-layout">
      <div className="auth-layout__glow auth-layout__glow--one" aria-hidden />
      <div className="auth-layout__glow auth-layout__glow--two" aria-hidden />
      <div className="auth-layout__arcs" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <Link to="/login" className="auth-layout__brand-mark">
        <BrandLogo compact />
      </Link>

      <div className={panelClass}>
        <div className="auth-layout__locale">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>

        {login || compact || hideIcon ? null : (
          <div className="auth-layout__feature-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 7H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
              <path d="M14 7h3v3" />
              <path d="M10 14 17 7" />
            </svg>
          </div>
        )}

        {title ? (
          <header className="auth-layout__header">
            <h1 className="auth-layout__title">{title}</h1>
            {subtitle ? <p className="auth-layout__subtitle">{subtitle}</p> : null}
          </header>
        ) : null}

        <div className="auth-layout__body">{children}</div>
        {footer ? <footer className="auth-layout__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
