import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  collectAncestorGroupIds,
  filterSidebarSections,
  type SidebarNode,
  type SidebarSection,
} from '@/navigation/sidebarNav'
import {
  getLinkIcon,
  getModuleIcon,
  getSectionIcon,
  getUtilityIcon,
  IconChevron,
  IconSearch,
} from '@/components/navigation/SidebarIcons'
import { useAuthStore } from '@/stores/authStore'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { fetchCompanies } from '@/modules/core/identity/services/identityService'
import './Sidebar.css'

const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'
const COMPANY_STORAGE_KEY = 'aios.companyId'

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
              className={['sidebar__item', 'sidebar__group-toggle', isOpen ? 'is-open' : '']
                .filter(Boolean)
                .join(' ')}
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
            <div
              className={['sidebar__collapse', isOpen && !collapsed ? 'is-open' : '']
                .filter(Boolean)
                .join(' ')}
            >
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
  const SectionIcon = getSectionIcon(section.id)
  const isOpen = !collapsed || openIds.has(section.id)

  return (
    <section className="sidebar__section">
      {collapsed ? (
        <button
          type="button"
          className={['sidebar__item', 'sidebar__section-icon-only', isOpen ? 'is-open' : '']
            .filter(Boolean)
            .join(' ')}
          title={section.label}
          aria-expanded={isOpen}
          onClick={() => onToggle(section.id)}
        >
          <span className="sidebar__icon">
            <SectionIcon />
          </span>
        </button>
      ) : (
        <p className="sidebar__section-label">{section.label}</p>
      )}
      <div className={['sidebar__collapse', isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}>
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
  const user = useAuthStore((state) => state.user)
  const [query, setQuery] = useState('')
  const [tenant, setTenant] = useState('Acme Group')
  const [companyId, setCompanyId] = useState(() => window.localStorage.getItem(COMPANY_STORAGE_KEY) ?? '')
  const [companyOptions, setCompanyOptions] = useState<Array<{ value: string; label: string }>>([])
  const [collapsed, setCollapsed] = useState(() => {
    return window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  })
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(['overview', 'overview.dashboard']))

  const sections = useMemo(() => filterSidebarSections(query), [query])
  const initials = (user?.name || user?.email || 'A')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

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

  useEffect(() => {
    let cancelled = false
    void fetchCompanies()
      .then((result) => {
        if (cancelled) {
          return
        }
        const active = result.items.filter((item) => item.status === 'active')
        const options = active.map((item) => ({ value: item.id, label: item.name }))
        setCompanyOptions(options)
        setCompanyId((current) => {
          if (current && options.some((item) => item.value === current)) {
            return current
          }
          const nextId = options[0]?.value ?? ''
          if (nextId) {
            window.localStorage.setItem(COMPANY_STORAGE_KEY, nextId)
          }
          return nextId
        })
      })
      .catch(() => {
        if (!cancelled) {
          setCompanyOptions([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const FavoritesIcon = getUtilityIcon('favorites')
  const RecentIcon = getUtilityIcon('recent')

  return (
    <aside
      className={['sidebar', collapsed ? 'sidebar--collapsed' : ''].filter(Boolean).join(' ')}
      aria-label="Primary"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="sidebar__brand-row">
        <div className="sidebar__brand" title="AIOS">
          <span className="sidebar__brand-mark" aria-hidden>
            A
          </span>
          <span className="sidebar__brand-text">AIOS</span>
        </div>
        <button
          type="button"
          className="sidebar__collapse-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((value) => !value)}
        >
          <IconChevron />
        </button>
      </div>

      <div className="sidebar__search">
        <span className="sidebar__search-icon" aria-hidden>
          <IconSearch />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search..."
          aria-label="Search navigation"
        />
      </div>

      {!collapsed ? (
        <div className="sidebar__context">
          <SidebarSelect
            label="Tenant"
            value={tenant}
            options={['Acme Group', 'Nova Holdings']}
            onChange={setTenant}
          />
          <SidebarSelect
            label="Company"
            value={companyId}
            options={companyOptions.length > 0 ? companyOptions : [{ value: '', label: 'No companies' }]}
            onChange={(next) => {
              setCompanyId(next)
              if (next) {
                window.localStorage.setItem(COMPANY_STORAGE_KEY, next)
              }
            }}
            disabled={companyOptions.length === 0}
          />
        </div>
      ) : null}

      <div className="sidebar__quick">
        <NavLink
          to="/favorites"
          title="Favorites"
          className={({ isActive }) =>
            ['sidebar__item', isActive ? 'sidebar__item--active' : ''].filter(Boolean).join(' ')
          }
        >
          <span className="sidebar__icon">
            <FavoritesIcon />
          </span>
          <span className="sidebar__label">Favorites</span>
        </NavLink>
        <NavLink
          to="/recent"
          title="Recent"
          className={({ isActive }) =>
            ['sidebar__item', isActive ? 'sidebar__item--active' : ''].filter(Boolean).join(' ')
          }
        >
          <span className="sidebar__icon">
            <RecentIcon />
          </span>
          <span className="sidebar__label">Recent</span>
        </NavLink>
      </div>

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

      <div className="sidebar__footer">
        <div className="sidebar__avatar" aria-hidden>
          {initials}
        </div>
        <div className="sidebar__user">
          <strong>{user?.name ?? 'User'}</strong>
          <span>{user?.email ?? ''}</span>
        </div>
      </div>
    </aside>
  )
}
