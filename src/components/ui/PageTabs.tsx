import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import './PageTabs.css'

export type PageTab = {
  id: string
  label: string
  /** Full path of the tab, so every tab is linkable and survives a reload. */
  to: string
}

type PageTabsProps = {
  items: PageTab[]
  ariaLabel: string
  /** Right-aligned slot on the same strip - e.g. a Back button. */
  actions?: ReactNode
  className?: string
}

/**
 * Secondary navigation INSIDE a page (a detail screen's own sections).
 *
 * Distinct from `ModuleTabs`, which reads `sidebarNav` and owns the strip under
 * the app header. This one takes an explicit list, so a detail page can expose
 * sections that are not sidebar entries.
 *
 * `end` is deliberate: tabs are siblings (`…/sources`, `…/agents`), never nested
 * under one another, so a prefix match would light up two tabs at once.
 *
 * The strip owns the bottom border, so a tab's active underline lands on it and
 * the `actions` slot sits at the same baseline.
 */
export function PageTabs({ items, ariaLabel, actions, className = '' }: PageTabsProps) {
  return (
    <div className={['page-tabs', className].filter(Boolean).join(' ')}>
      <nav className="page-tabs__list" aria-label={ariaLabel}>
        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end
            className={({ isActive }) =>
              ['page-tabs__tab', isActive ? 'page-tabs__tab--active' : ''].filter(Boolean).join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      {actions ? <div className="page-tabs__actions">{actions}</div> : null}
    </div>
  )
}
