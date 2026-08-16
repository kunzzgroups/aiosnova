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
import {
  getLinkIcon,
  getModuleIcon,
  getSectionIcon,
  getUtilityIcon,
  IconChevron,
  IconPanelLeft,
  IconPanelRight,
} from '@/components/navigation/SidebarIcons'
import './Sidebar.css'

const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'

function SidebarNodeList({
  nodes,
  depth,
  openIds,
  onToggle,
  collapsed,
}: {
  nodes: SidebarNode[]
  depth: number
  openIds: Set<string>
  onToggle: (id: string) => void
  collapsed: boolean
}) {
  return (
    <ul className={`sidebar__list sidebar__list--depth-${Math.min(depth, 3)}`}>
      {nodes.map((node) => {
        if (node.kind === 'link') {
          const LinkIcon = getLinkIcon()
          return (
            <li key={node.id}>
              <NavLink
                to={node.path}
                title={node.label}
                className={({ isActive }) =>
                  ['sidebar__link', isActive ? 'sidebar__link--active' : ''].filter(Boolean).join(' ')
                }
              >
                <span className="sidebar__icon">
                  <LinkIcon />
                </span>
                <span className="sidebar__label">{node.label}</span>
              </NavLink>
            </li>
          )
        }

        const isOpen = openIds.has(node.id)
        const ModuleIcon = getModuleIcon(node.label)
        return (
          <li key={node.id} className="sidebar__group">
            <button
              type="button"
              className={['sidebar__group-toggle', isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
              aria-expanded={isOpen}
              title={node.label}
              onClick={() => onToggle(node.id)}
            >
              <span className="sidebar__row-main">
                <span className="sidebar__icon">
                  <ModuleIcon />
                </span>
                <span className="sidebar__label">{node.label}</span>
              </span>
              {!collapsed ? (
                <span className="sidebar__chevron" aria-hidden>
                  <IconChevron />
                </span>
              ) : null}
            </button>
            <div className={['sidebar__collapse', isOpen && !collapsed ? 'is-open' : ''].filter(Boolean).join(' ')}>
              <div className="sidebar__collapse-inner">
                <SidebarNodeList
                  nodes={node.children}
                  depth={depth + 1}
                  openIds={openIds}
                  onToggle={onToggle}
                  collapsed={collapsed}
                />
              </div>
            </div>
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
  collapsed,
}: {
  section: SidebarSection
  openIds: Set<string>
  onToggle: (id: string) => void
  collapsed: boolean
}) {
  const isOpen = openIds.has(section.id)
  const SectionIcon = getSectionIcon(section.id)

  return (
    <section className="sidebar__section">
      <button
        type="button"
        className={['sidebar__section-toggle', isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={isOpen}
        title={section.label}
        onClick={() => onToggle(section.id)}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <SectionIcon />
          </span>
          <span className="sidebar__label">{section.label}</span>
        </span>
        {!collapsed ? (
          <span className="sidebar__chevron" aria-hidden>
            <IconChevron />
          </span>
        ) : null}
      </button>
      <div className={['sidebar__collapse', isOpen && !collapsed ? 'is-open' : ''].filter(Boolean).join(' ')}>
        <div className="sidebar__collapse-inner">
          <SidebarNodeList
            nodes={section.children}
            depth={1}
            openIds={openIds}
            onToggle={onToggle}
            collapsed={collapsed}
          />
        </div>
      </div>
    </section>
  )
}

export function Sidebar() {
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [tenant, setTenant] = useState('Acme Group')
  const [company, setCompany] = useState('Acme Retail')
  const [collapsed, setCollapsed] = useState(() => {
    return window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  })
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

  useEffect(() => {
    window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  function handleToggle(id: string) {
    if (collapsed) {
      setCollapsed(false)
      setOpenIds((current) => new Set(current).add(id))
      return
    }

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
      if (collapsed) {
        setCollapsed(false)
        setShowSearch(true)
        return
      }
      setShowSearch((value) => !value)
    }
  }

  return (
    <aside
      className={['sidebar', collapsed ? 'sidebar--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label="Primary"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="sidebar__brand-row">
        <div className="sidebar__brand" title="AIOS">
          <span className="sidebar__brand-mark">A</span>
          <span className="sidebar__brand-text">AIOS</span>
        </div>
        <button
          type="button"
          className="sidebar__collapse-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <IconPanelRight /> : <IconPanelLeft />}
        </button>
      </div>

      <div className="sidebar__utilities">
        {sidebarUtilities.map((item) => {
          const UtilityIcon = getUtilityIcon(item.id)

          if (item.path) {
            return (
              <NavLink
                key={item.id}
                to={item.path}
                title={item.label}
                className={({ isActive }) =>
                  ['sidebar__utility', isActive ? 'sidebar__utility--active' : '']
                    .filter(Boolean)
                    .join(' ')
                }
              >
                <span className="sidebar__icon">
                  <UtilityIcon />
                </span>
                <span className="sidebar__label">{item.label}</span>
              </NavLink>
            )
          }

          if (item.action === 'tenant' || item.action === 'company') {
            const value = item.action === 'tenant' ? tenant : company
            const onChange = item.action === 'tenant' ? setTenant : setCompany
            const options =
              item.action === 'tenant' ? ['Acme Group', 'Nova Holdings'] : ['Acme Retail', 'Acme Wholesale']

            return (
              <label key={item.id} className="sidebar__select-field" title={item.label}>
                <span className="sidebar__select-heading">
                  <span className="sidebar__icon">
                    <UtilityIcon />
                  </span>
                  <span className="sidebar__label">{item.label}</span>
                </span>
                {!collapsed ? (
                  <select value={value} onChange={(event) => onChange(event.target.value)}>
                    {options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : null}
              </label>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              className="sidebar__utility"
              title={item.label}
              onClick={() => handleUtilityClick(item.action)}
            >
              <span className="sidebar__icon">
                <UtilityIcon />
              </span>
              <span className="sidebar__label">{item.label}</span>
            </button>
          )
        })}
      </div>

      {showSearch && !collapsed ? (
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
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  )
}
