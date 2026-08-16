import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './AuthLayout.css'

type AuthLayoutProps = {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__panel">
        <header className="auth-layout__header">
          <Link to="/login" className="auth-layout__brand">
            AIOS
          </Link>
          <h1 className="auth-layout__title">{title}</h1>
          {subtitle ? <p className="auth-layout__subtitle">{subtitle}</p> : null}
        </header>
        <div className="auth-layout__body">{children}</div>
        {footer ? <footer className="auth-layout__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
