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
  IconBriefcase,
  IconBuilding,
  IconChevron,
  IconDot,
  IconMinus,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@/components/navigation/SidebarIcons'
import { useAuthStore } from '@/stores/authStore'
import { fetchCompanies } from '@/modules/core/identity/services/identityService'
import type { CompanyRecord } from '@/modules/core/identity/types/identity'
import './Sidebar.css'

const DEFAULT_TENANT_NAME = 'GROUP COMPANIE'
const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'
const COMPANY_STORAGE_KEY = 'aios.companyId'

type CompanyOption = { value: string; label: string }

function toCompanyOptions(items: Array<Pick<CompanyRecord, 'id' | 'name' | 'status'>>): CompanyOption[] {
  return items
    .filter((item) => item.status === 'active')
    .map((item) => ({ value: item.id, label: item.name }))
}

async function loadCompanyOptions(): Promise<CompanyOption[]> {
  try {
    const result = await fetchCompanies()
    const items = Array.isArray(result.items) ? result.items : []
    return toCompanyOptions(items)
  } catch {
    if (import.meta.env.DEV) {
      const { identityCompanies } = await import('@/mocks/data/identity')
      return toCompanyOptions(identityCompanies)
    }
    return []
  }
}

type CompanyFlyoutSection = {
  id: string
  label: string
  icon: typeof IconBriefcase
  items: Array<{ id: string; label: string; to: string }>
}

function getCompanyFlyoutSections(companyId: string): CompanyFlyoutSection[] {
  return [
    {
      id: 'workspace',
      label: 'Workspace',
      icon: IconBriefcase,
      items: [{ id: 'overview', label: 'Company Overview', to: `/system/core/companies/${companyId}` }],
    },
    {
      id: 'identity',
      label: 'Identity',
      icon: IconUsers,
      items: [
        { id: 'users', label: 'Users', to: '/system/core/users' },
        { id: 'membership', label: 'Membership', to: '/system/core/membership' },
      ],
    },
  ]
}

function TenantCompanyBlock({
  tenantName,
  open,
  collapsed,
  companies,
  highlightedCompanyId,
  onToggle,
  onSelectCompany,
}: {
  tenantName: string
  open: boolean
  collapsed: boolean
  companies: CompanyOption[]
  highlightedCompanyId: string
  onToggle: () => void
  onSelectCompany: (companyId: string) => void
}) {
  return (
    <div className={['sidebar__context-group', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={['sidebar__item', 'sidebar__context-toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={open}
        title={tenantName}
        onClick={onToggle}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <IconBuilding />
          </span>
          <span className="sidebar__label">{tenantName}</span>
        </span>
        {!collapsed ? (
          <span className="sidebar__expander" aria-hidden>
            {open ? <IconMinus /> : <IconPlus />}
          </span>
        ) : null}
      </button>
      {open && !collapsed ? (
        <ul className="sidebar__context-tree">
          {companies.length === 0 ? (
            <li>
              <span className="sidebar__context-empty">No companies</span>
            </li>
          ) : (
            companies.map((company) => {
              const selected = company.value === highlightedCompanyId
              return (
                <li key={company.value}>
                  <button
                    type="button"
                    className={['sidebar__context-option', selected ? 'is-selected' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectCompany(company.value)}
                  >
                    <span className="sidebar__label">{company.label}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}

function CompanyFlyout({ company }: { company: CompanyOption }) {
  const sections = getCompanyFlyoutSections(company.value)

  return (
    <aside className="sidebar-flyout" aria-label={company.label}>
      <div className="sidebar-flyout__inner">
        <p className="sidebar-flyout__company">{company.label}</p>
        {sections.map((section) => {
          const SectionIcon = section.icon
          return (
            <section key={section.id} className="sidebar-flyout__section">
              <header className="sidebar-flyout__section-head">
                <SectionIcon />
                <span>
                  {section.label} ({section.items.length})
                </span>
              </header>
              <ul className="sidebar-flyout__list">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        ['sidebar-flyout__link', isActive ? 'sidebar-flyout__link--active' : '']
                          .filter(Boolean)
                          .join(' ')
                      }
                    >
                      <span className="sidebar-flyout__link-icon" aria-hidden>
                        <IconDot />
                      </span>
                      <span className="sidebar-flyout__link-label">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </aside>
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
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const [query, setQuery] = useState('')
  const [companyId, setCompanyId] = useState(() => window.localStorage.getItem(COMPANY_STORAGE_KEY) ?? '')
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    return window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  })
  const [tenantOpen, setTenantOpen] = useState(true)
  const [flyoutCompanyId, setFlyoutCompanyId] = useState<string | null>(null)
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
    if (collapsed) {
      setFlyoutCompanyId(null)
    }
  }, [collapsed])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    let cancelled = false
    void loadCompanyOptions().then((options) => {
      if (cancelled) {
        return
      }
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
    return () => {
      cancelled = true
    }
  }, [isHydrated])

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
  const flyoutCompany = companyOptions.find((item) => item.value === flyoutCompanyId) ?? null
  const highlightedCompanyId = flyoutCompanyId ?? companyId

  function handleSelectCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId)
    window.localStorage.setItem(COMPANY_STORAGE_KEY, nextCompanyId)
    setFlyoutCompanyId((current) => (current === nextCompanyId ? null : nextCompanyId))
  }

  return (
    <div
      className={['sidebar-shell', flyoutCompany ? 'sidebar-shell--flyout-open' : ''].filter(Boolean).join(' ')}
    >
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
          <TenantCompanyBlock
            tenantName={DEFAULT_TENANT_NAME}
            open={tenantOpen}
            collapsed={collapsed}
            companies={companyOptions}
            highlightedCompanyId={highlightedCompanyId}
            onToggle={() => {
              setTenantOpen((current) => {
                if (current) {
                  setFlyoutCompanyId(null)
                }
                return !current
              })
            }}
            onSelectCompany={handleSelectCompany}
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

      {flyoutCompany && !collapsed && tenantOpen ? <CompanyFlyout company={flyoutCompany} /> : null}
    </div>
  )
}
