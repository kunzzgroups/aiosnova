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
  IconBuilding,
  IconChevron,
  IconDot,
  IconMinus,
  IconPlus,
  IconSearch,
  IconStore,
} from '@/components/navigation/SidebarIcons'
import { useAuthStore } from '@/stores/authStore'
import { fetchCompanies } from '@/modules/core/identity/services/identityService'
import type { CompanyRecord } from '@/modules/core/identity/types/identity'
import type { CompanyGroupRecord } from '@/mocks/data/identity'
import './Sidebar.css'

const GROUP_COMPANIES_LABEL = 'GROUP COMPANIES'
const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'
const COMPANY_STORAGE_KEY = 'aios.companyId'

type CompanyOption = { value: string; label: string }

type Level2Item =
  | { kind: 'group'; id: string; label: string; companies: CompanyOption[] }
  | { kind: 'company'; id: string; label: string }

function toCompanyOptions(items: Array<Pick<CompanyRecord, 'id' | 'name' | 'status'>>): CompanyOption[] {
  return items
    .filter((item) => item.status === 'active')
    .map((item) => ({ value: item.id, label: item.name }))
}

function buildLevel2Items(
  companies: CompanyOption[],
  groups: CompanyGroupRecord[],
): Level2Item[] {
  const companyMap = new Map(companies.map((item) => [item.value, item]))
  const groupedIds = new Set(groups.flatMap((group) => group.companyIds))

  const groupItems: Level2Item[] = groups.map((group) => ({
    kind: 'group',
    id: group.id,
    label: group.name,
    companies: group.companyIds
      .map((id) => companyMap.get(id))
      .filter((item): item is CompanyOption => Boolean(item)),
  }))

  const standalone: Level2Item[] = companies
    .filter((item) => !groupedIds.has(item.value))
    .map((item) => ({ kind: 'company', id: item.value, label: item.label }))

  return [...groupItems, ...standalone]
}

async function loadGroupCompaniesData(): Promise<{
  companies: CompanyOption[]
  groups: CompanyGroupRecord[]
}> {
  const { identityCompanyGroups } = await import('@/mocks/data/identity')

  try {
    const result = await fetchCompanies()
    const items = Array.isArray(result.items) ? result.items : []
    return {
      companies: toCompanyOptions(items),
      groups: identityCompanyGroups,
    }
  } catch {
    if (import.meta.env.DEV) {
      const { identityCompanies } = await import('@/mocks/data/identity')
      return {
        companies: toCompanyOptions(identityCompanies),
        groups: identityCompanyGroups,
      }
    }
    return { companies: [], groups: [] }
  }
}

function GroupCompaniesBlock({
  open,
  collapsed,
  items,
  selectedLevel2Id,
  onToggle,
  onSelectItem,
}: {
  open: boolean
  collapsed: boolean
  items: Level2Item[]
  selectedLevel2Id: string | null
  onToggle: () => void
  onSelectItem: (item: Level2Item) => void
}) {
  return (
    <div className={['sidebar__context-group', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={['sidebar__item', 'sidebar__context-toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-expanded={open}
        title={GROUP_COMPANIES_LABEL}
        onClick={onToggle}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <IconBuilding />
          </span>
          <span className="sidebar__label">{GROUP_COMPANIES_LABEL}</span>
        </span>
        {!collapsed ? (
          <span className="sidebar__expander" aria-hidden>
            {open ? <IconMinus /> : <IconPlus />}
          </span>
        ) : null}
      </button>
      {open && !collapsed ? (
        <ul className="sidebar__context-tree">
          {items.length === 0 ? (
            <li>
              <span className="sidebar__context-empty">No groups or companies</span>
            </li>
          ) : (
            items.map((item) => {
              const selected = item.id === selectedLevel2Id
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={['sidebar__context-option', selected ? 'is-selected' : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectItem(item)}
                  >
                    <span className="sidebar__label">{item.label}</span>
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

function GroupCompaniesFlyout({
  companies,
  selectedCompanyId,
  onSelectCompany,
}: {
  companies: CompanyOption[]
  selectedCompanyId: string
  onSelectCompany: (companyId: string) => void
}) {
  return (
    <aside className="sidebar-flyout" aria-label="Companies">
      <div className="sidebar-flyout__inner">
        <section className="sidebar-flyout__section">
          <header className="sidebar-flyout__section-head">
            <IconStore />
            <span>Companies ({companies.length})</span>
          </header>
          <ul className="sidebar-flyout__list">
            {companies.length === 0 ? (
              <li>
                <span className="sidebar__context-empty">No companies in this group</span>
              </li>
            ) : (
              companies.map((company) => {
                const selected = company.value === selectedCompanyId
                return (
                  <li key={company.value}>
                    <button
                      type="button"
                      className={[
                        'sidebar-flyout__link',
                        'sidebar-flyout__link--button',
                        selected ? 'sidebar-flyout__link--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onSelectCompany(company.value)}
                    >
                      <span className="sidebar-flyout__link-icon" aria-hidden>
                        <IconDot />
                      </span>
                      <span className="sidebar-flyout__link-label">{company.label}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </section>
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
  const [companyGroups, setCompanyGroups] = useState<CompanyGroupRecord[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    return window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  })
  const [groupCompaniesOpen, setGroupCompaniesOpen] = useState(true)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  const sections = useMemo(() => filterSidebarSections(query), [query])
  const level2Items = useMemo(
    () => buildLevel2Items(companyOptions, companyGroups),
    [companyOptions, companyGroups],
  )
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
      setOpenGroupId(null)
    }
  }, [collapsed])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    let cancelled = false
    void loadGroupCompaniesData().then(({ companies, groups }) => {
      if (cancelled) {
        return
      }
      setCompanyOptions(companies)
      setCompanyGroups(groups)
      setCompanyId((current) => {
        if (current && companies.some((item) => item.value === current)) {
          return current
        }
        const nextId = companies[0]?.value ?? ''
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

  function persistCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId)
    window.localStorage.setItem(COMPANY_STORAGE_KEY, nextCompanyId)
  }

  function handleSelectLevel2(item: Level2Item) {
    if (item.kind === 'group') {
      setOpenGroupId((current) => (current === item.id ? null : item.id))
      return
    }

    persistCompany(item.id)
    setOpenGroupId(null)
  }

  function handleSelectCompanyFromGroup(nextCompanyId: string) {
    persistCompany(nextCompanyId)
  }

  const activeCompany = companyOptions.find((item) => item.value === companyId) ?? null

  const selectedLevel2Id = openGroupId
    ? openGroupId
    : level2Items.find((item) => item.kind === 'company' && item.id === companyId)?.id ?? null

  const activeGroup = openGroupId
    ? level2Items.find((item): item is Extract<Level2Item, { kind: 'group' }> => {
        return item.kind === 'group' && item.id === openGroupId
      })
    : null
  const flyoutOpen = Boolean(activeGroup)

  return (
    <div className={['sidebar-shell', flyoutOpen ? 'sidebar-shell--flyout-open' : ''].filter(Boolean).join(' ')}>
      <aside
        className={['sidebar', collapsed ? 'sidebar--collapsed' : ''].filter(Boolean).join(' ')}
        aria-label="Primary"
        data-collapsed={collapsed ? 'true' : 'false'}
        data-company-id={companyId || undefined}
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
          <GroupCompaniesBlock
            open={groupCompaniesOpen}
            collapsed={collapsed}
            items={level2Items}
            selectedLevel2Id={selectedLevel2Id}
            onToggle={() => {
              setGroupCompaniesOpen((current) => {
                if (current) {
                  setOpenGroupId(null)
                }
                return !current
              })
            }}
            onSelectItem={handleSelectLevel2}
          />
        </div>
      ) : null}

      {!collapsed && activeCompany ? (
        <div className="sidebar__company-context" title={activeCompany.label}>
          <span className="sidebar__company-context-label">Active company</span>
          <strong className="sidebar__company-context-name">{activeCompany.label}</strong>
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

      {activeGroup && !collapsed && groupCompaniesOpen ? (
        <GroupCompaniesFlyout
          companies={activeGroup.companies}
          selectedCompanyId={companyId}
          onSelectCompany={handleSelectCompanyFromGroup}
        />
      ) : null}
    </div>
  )
}
