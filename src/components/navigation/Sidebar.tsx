import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  collectAncestorGroupIds,
  filterSidebarSections,
  type SidebarNode,
  type SidebarSection,
} from '@/navigation/sidebarNav'
import { BrandLogo } from '@/components/brand/BrandLogo'
import {
  getLinkIcon,
  getModuleIcon,
  getSectionIcon,
  getUtilityIcon,
  IconBuilding,
  IconChevron,
  IconMinus,
  IconPlus,
  IconSearch,
  IconStore,
} from '@/components/navigation/SidebarIcons'
import { useAuthStore } from '@/stores/authStore'
import { fetchCompanies } from '@/modules/core/identity/services/identityService'
import './Sidebar.css'

const TENANT_OPTIONS = ['Acme Group', 'Nova Holdings'] as const
const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'
const COMPANY_STORAGE_KEY = 'aios.companyId'

function ContextSwitcher({
  label,
  icon,
  open,
  collapsed,
  options,
  value,
  disabled,
  onToggle,
  onSelect,
}: {
  label: string
  icon: typeof IconBuilding
  open: boolean
  collapsed: boolean
  options: Array<{ value: string; label: string }>
  value: string
  disabled?: boolean
  onToggle: () => void
  onSelect: (value: string) => void
}) {
  const Icon = icon
  return (
    <div className={['sidebar__context-group', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={['sidebar__item', 'sidebar__context-toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={open}
        title={label}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <Icon />
          </span>
          <span className="sidebar__label">{label}</span>
        </span>
        {!collapsed ? (
          <span className="sidebar__expander" aria-hidden>
            {open ? <IconMinus /> : <IconPlus />}
          </span>
        ) : null}
      </button>
      {open && !collapsed ? (
        <ul className="sidebar__context-tree">
          {options.map((option) => {
            const selected = option.value === value
            return (
              <li key={option.value || option.label}>
                <button
                  type="button"
                  className={['sidebar__context-option', selected ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(option.value)}
                >
                  <span className="sidebar__label">{option.label}</span>
                  <span className="sidebar__context-chevron" aria-hidden>
                    <IconChevron />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function collectGroupIds(nodes: SidebarNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.kind === 'group') {
      ids.push(node.id, ...collectGroupIds(node.children))
    }
  }
  return ids
}

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
    <ul className={`sidebar__list sidebar__list--depth-${Math.min(depth, 2)}`}>
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
                {depth === 1 ? (
                  <span className="sidebar__icon">
                    <LinkIcon />
                  </span>
                ) : null}
                <span className="sidebar__label">{node.label}</span>
              </NavLink>
            </li>
          )
        }

        const isOpen = openIds.has(node.id) && !collapsed
        const ModuleIcon = getModuleIcon(node.label)
        return (
          <li key={node.id} className={['sidebar__group', isOpen ? 'is-open' : ''].filter(Boolean).join(' ')}>
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
                <span className="sidebar__expander" aria-hidden>
                  {isOpen ? <IconMinus /> : <IconPlus />}
                </span>
              ) : null}
            </button>
            {isOpen ? (
              <div className="sidebar__subtree">
                <SidebarNodeList
                  nodes={node.children}
                  depth={depth + 1}
                  openIds={openIds}
                  onToggle={onToggle}
                  collapsed={collapsed}
                />
              </div>
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
  collapsed,
}: {
  section: SidebarSection
  openIds: Set<string>
  onToggle: (id: string) => void
  collapsed: boolean
}) {
  const SectionIcon = getSectionIcon(section.id)

  return (
    <section className="sidebar__section">
      {collapsed ? (
        <button
          type="button"
          className="sidebar__item sidebar__section-icon-only"
          title={section.label}
          onClick={() => onToggle(section.children[0]?.kind === 'group' ? section.children[0].id : section.id)}
        >
          <span className="sidebar__icon">
            <SectionIcon />
          </span>
        </button>
      ) : (
        <>
          <p className="sidebar__section-label">{section.label}</p>
          <SidebarNodeList
            nodes={section.children}
            depth={1}
            openIds={openIds}
            onToggle={onToggle}
            collapsed={collapsed}
          />
        </>
      )}
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
  const [contextOpen, setContextOpen] = useState<'tenant' | 'company' | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  const sections = useMemo(() => filterSidebarSections(query), [query])
  const initials = (user?.name || user?.email || 'A')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  useEffect(() => {
    if (query.trim()) {
      setOpenIds(new Set(sections.flatMap((section) => collectGroupIds(section.children))))
      return
    }
    const ancestors = collectAncestorGroupIds(location.pathname)
    const groupId = ancestors.length > 1 ? ancestors[ancestors.length - 1] : ancestors[0]
    setOpenIds(groupId ? new Set([groupId]) : new Set())
  }, [location.pathname, query, sections])

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
      setOpenIds(new Set([id]))
      return
    }

    setOpenIds((current) => {
      if (current.has(id) && !query.trim()) {
        return new Set()
      }
      return new Set([id])
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
        <div className="sidebar__brand" title="AIOS NOVA">
          <BrandLogo />
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
          <ContextSwitcher
            label="Tenant"
            icon={IconBuilding}
            open={contextOpen === 'tenant'}
            collapsed={collapsed}
            options={TENANT_OPTIONS.map((item) => ({ value: item, label: item }))}
            value={tenant}
            onToggle={() => setContextOpen((current) => (current === 'tenant' ? null : 'tenant'))}
            onSelect={(next) => setTenant(next)}
          />
          <ContextSwitcher
            label="Company"
            icon={IconStore}
            open={contextOpen === 'company'}
            collapsed={collapsed}
            options={companyOptions}
            value={companyId}
            disabled={companyOptions.length === 0}
            onToggle={() => setContextOpen((current) => (current === 'company' ? null : 'company'))}
            onSelect={(next) => {
              setCompanyId(next)
              if (next) {
                window.localStorage.setItem(COMPANY_STORAGE_KEY, next)
              }
            }}
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
