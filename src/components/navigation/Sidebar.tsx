import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  collectAncestorGroupIds,
  filterSidebarSections,
  sidebarUtilities,
  type SidebarNode,
  type SidebarSection,
  type SidebarUtilityItem,
} from '@/navigation/sidebarNav'
import './Sidebar.css'

function SidebarNodeList({
  nodes,
  depth,
  openIds,
  onToggle,
}: {
  nodes: SidebarNode[]
  depth: number
  openIds: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <ul className={`sidebar__list sidebar__list--depth-${Math.min(depth, 3)}`}>
      {nodes.map((node) => {
        if (node.kind === 'link') {
          return (
            <li key={node.id}>
              <NavLink
                to={node.path}
                className={({ isActive }) =>
                  ['sidebar__link', isActive ? 'sidebar__link--active' : ''].filter(Boolean).join(' ')
                }
              >
                {node.label}
              </NavLink>
            </li>
          )
        }

        const isOpen = openIds.has(node.id)
        return (
          <li key={node.id} className="sidebar__group">
            <button
              type="button"
              className="sidebar__group-toggle"
              aria-expanded={isOpen}
              onClick={() => onToggle(node.id)}
            >
              <span>{node.label}</span>
              <span className="sidebar__chevron" aria-hidden>
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen ? (
              <SidebarNodeList
                nodes={node.children}
                depth={depth + 1}
                openIds={openIds}
                onToggle={onToggle}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function SectionBlock({
  section,
  openIds,
  onToggle,
}: {
  section: SidebarSection
  openIds: Set<string>
  onToggle: (id: string) => void
}) {
  const isOpen = openIds.has(section.id)

  return (
    <section className="sidebar__section">
      <button
        type="button"
        className="sidebar__section-toggle"
        aria-expanded={isOpen}
        onClick={() => onToggle(section.id)}
      >
        <span>{section.label}</span>
        <span className="sidebar__chevron" aria-hidden>
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen ? (
        <SidebarNodeList nodes={section.children} depth={1} openIds={openIds} onToggle={onToggle} />
      ) : null}
    </section>
  )
}

export function Sidebar() {
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [tenant, setTenant] = useState('Acme Group')
  const [company, setCompany] = useState('Acme Retail')
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(['overview', 'overview.dashboard']))

  const sections = useMemo(() => filterSidebarSections(query), [query])

  useEffect(() => {
    const ancestors = collectAncestorGroupIds(location.pathname)
    if (ancestors.length === 0) {
      return
    }
    setOpenIds((current) => {
      const next = new Set(current)
      for (const id of ancestors) {
        next.add(id)
      }
      return next
    })
  }, [location.pathname])

  function handleToggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleUtilityClick(action?: SidebarUtilityItem['action']) {
    if (action === 'search') {
      setShowSearch((value) => !value)
    }
  }

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">AIOS</div>

      <div className="sidebar__utilities">
        {sidebarUtilities.map((item) => {
          if (item.path) {
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  ['sidebar__utility', isActive ? 'sidebar__utility--active' : '']
                    .filter(Boolean)
                    .join(' ')
                }
              >
                {item.label}
              </NavLink>
            )
          }

          if (item.action === 'tenant') {
            return (
              <label key={item.id} className="sidebar__select-field">
                <span>{item.label}</span>
                <select value={tenant} onChange={(event) => setTenant(event.target.value)}>
                  <option>Acme Group</option>
                  <option>Nova Holdings</option>
                </select>
              </label>
            )
          }

          if (item.action === 'company') {
            return (
              <label key={item.id} className="sidebar__select-field">
                <span>{item.label}</span>
                <select value={company} onChange={(event) => setCompany(event.target.value)}>
                  <option>Acme Retail</option>
                  <option>Acme Wholesale</option>
                </select>
              </label>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              className="sidebar__utility"
              onClick={() => handleUtilityClick(item.action)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {showSearch ? (
        <div className="sidebar__search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter navigation…"
            aria-label="Filter navigation"
          />
        </div>
      ) : null}

      <nav className="sidebar__nav">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            openIds={openIds}
            onToggle={handleToggle}
          />
        ))}
      </nav>
    </aside>
  )
}
