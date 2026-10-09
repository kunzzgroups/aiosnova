import type { ComponentPropsWithoutRef } from 'react'
import './TablePanel.css'

export function TablePanel({ className = '', children, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section className={`identity-panel identity-directory-panel identity-directory-design ui-table-panel ${className}`} {...props}>{children}</section>
}
