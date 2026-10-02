import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  filterSidebarSections,
  findModuleByPath,
  type SidebarLink,
  type SidebarNode,
  type SidebarSection,
} from '@/navigation/sidebarNav'
import { BrandLogo } from '@/components/brand/BrandLogo'
import {
  getModuleIcon,
  getSectionIcon,
  IconBuilding,
  IconChevron,
  IconLogout,
  IconSearch,
} from '@/components/navigation/SidebarIcons'
import { useTranslation } from 'react-i18next'
import { useNavLabel } from '@/i18n/useNavLabel'
import { useAuthStore } from '@/stores/authStore'
import { useCompanyStore } from '@/stores/companyStore'
import { logout } from '@/modules/core/auth/services/authService'
import { fetchCompanies } from '@/modules/core/identity/services/identityService'
import type { CompanyRecord } from '@/modules/core/identity/types/identity'
import type { CompanyGroupRecord } from '@/mocks/data/identity'
import './Sidebar.css'

const COLLAPSED_STORAGE_KEY = 'aios.sidebar.collapsed'

/**
 * Grace period before hover-opened popovers close. Has to be long enough to
 * cross the gap between two stacked flyouts (or move onto a side panel).
 */
const POPOVER_HIDE_DELAY_MS = 320

/**
 * A section is worth a chooser panel only when it actually offers a choice.
 * Single-module sections (Dashboard, AI, Platform Admin) get a plain name tip on
 * the collapsed rail and a direct link in the expanded sidebar instead.
 */
function hasModuleChoice(section: SidebarSection): boolean {
  return section.children.filter((node) => node.kind === 'group').length > 1
}

/**
 * First page inside a section, depth first. The collapsed rail sends a click on
 * a section icon straight here, so a collapsed sidebar is still a way to move
 * around rather than only a way to re-open itself.
 */
function firstLinkInSection(section: SidebarSection): SidebarLink | null {
  function visit(nodes: SidebarNode[]): SidebarLink | null {
    for (const node of nodes) {
      if (node.kind === 'link') {
        return node
      }
      const nested = visit(node.children)
      if (nested) {
        return nested
      }
    }
    return null
  }

  return visit(section.children)
}

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
  onOpen,
  onLeave,
}: {
  open: boolean
  onOpen: (anchor: HTMLButtonElement) => void
  onLeave: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className={['sidebar__context-group', open ? 'is-open' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={['sidebar__item', 'sidebar__context-toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
        data-group-panel="true"
        title={t('sidebar.groupCompanies')}
        onMouseEnter={(event) => onOpen(event.currentTarget)}
        onMouseLeave={onLeave}
        onFocus={(event) => onOpen(event.currentTarget)}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <IconBuilding />
          </span>
          <span className="sidebar__label">{t('sidebar.groupCompanies')}</span>
        </span>
        <span className="sidebar__expander" aria-hidden>
          <IconChevron />
        </span>
      </button>
    </div>
  )
}

function GroupCompaniesPanel({
  items,
  highlightedLevel2Id,
  top,
  onHoverItem,
  onSelectItem,
  onMouseEnter,
  onMouseLeave,
}: {
  items: Level2Item[]
  highlightedLevel2Id: string | null
  top: number
  onHoverItem: (item: Level2Item) => void
  onSelectItem: (item: Level2Item) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const { t } = useTranslation()

  return (
    <aside
      className="sidebar-flyout sidebar-flyout--groups"
      aria-label={t('sidebar.groupCompanies')}
      style={{ top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sidebar-flyout__inner">
        <section className="sidebar-flyout__section">
          <header className="sidebar-flyout__section-head">
            <IconBuilding />
            <span>{t('sidebar.groupCompanies')}</span>
          </header>
          <ul className="sidebar-flyout__list">
            {items.length === 0 ? (
              <li>
                <span className="sidebar__context-empty">{t('sidebar.noGroups')}</span>
              </li>
            ) : (
              items.map((item) => {
                const highlighted = item.id === highlightedLevel2Id
                return (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      className={[
                        'sidebar-flyout__link',
                        'sidebar-flyout__link--button',
                        highlighted ? 'sidebar-flyout__link--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={() => onHoverItem(item)}
                      onFocus={() => onHoverItem(item)}
                      onClick={() => onSelectItem(item)}
                    >
                      <span className="sidebar-flyout__link-label">{item.label}</span>
                      {item.kind === 'group' ? (
                        <span className="sidebar-flyout__link-expander" aria-hidden>
                          <IconChevron />
                        </span>
                      ) : null}
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

function SectionModulesFlyout({
  section,
  top,
  onMouseEnter,
  onMouseLeave,
  onNavigate,
}: {
  section: SidebarSection
  top: number
  onMouseEnter: () => void
  onMouseLeave: () => void
  onNavigate: () => void
}) {
  const location = useLocation()
  const SectionIcon = getSectionIcon(section.id)
  const navLabel = useNavLabel()
  const activeModuleId = findModuleByPath(location.pathname)?.module.id ?? null

  return (
    <aside
      className="sidebar-flyout sidebar-flyout--modules"
      aria-label={navLabel(section)}
      style={{ top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="sidebar-flyout__inner">
        <section className="sidebar-flyout__section">
          <header className="sidebar-flyout__section-head">
            <SectionIcon />
            <span>{navLabel(section)}</span>
          </header>
          <ul className="sidebar-flyout__list">
            {section.children.map((node) => {
              if (node.kind === 'link') {
                return (
                  <li key={node.id}>
                    <NavLink to={node.path} className="sidebar-flyout__link" onClick={onNavigate}>
                      <span className="sidebar-flyout__link-label">{navLabel(node)}</span>
                    </NavLink>
                  </li>
                )
              }

              const ModuleIcon = getModuleIcon(node.label)
              const target = node.children.find(
                (child): child is SidebarLink => child.kind === 'link',
              )

              if (!target) {
                return (
                  <li key={node.id}>
                    <span className="sidebar-flyout__link sidebar-flyout__link--static">
                      <span className="sidebar-flyout__link-icon">
                        <ModuleIcon />
                      </span>
                      <span className="sidebar-flyout__link-label">{navLabel(node)}</span>
                    </span>
                  </li>
                )
              }

              return (
                <li key={node.id}>
                  <NavLink
                    to={target.path}
                    className={[
                      'sidebar-flyout__link',
                      activeModuleId === node.id ? 'sidebar-flyout__link--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={onNavigate}
                  >
                    <span className="sidebar-flyout__link-icon">
                      <ModuleIcon />
                    </span>
                    <span className="sidebar-flyout__link-label">{navLabel(node)}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </aside>
  )
}


/**
 * One sidebar section. Expanded it is either a right-side panel trigger, or -
 * when the section has a single module - a plain link straight into it (the
 * module tab bar in the top bar then handles the sub-pages).
 */
function SectionBlock({
  section,
  collapsed,
  flyout,
  hover,
  onExpand,
}: {
  section: SidebarSection
  collapsed: boolean
  flyout: {
    open: boolean
    // HTMLElement, not HTMLButtonElement: in the collapsed rail the same row is
    // a NavLink, and the flyout only needs its position.
    onEnter: (anchor: HTMLElement) => void
    onLeave: () => void
    onActivate: (anchor: HTMLElement) => void
  }
  /** Collapsed rail: hovering an icon asks the parent for its name panel/tip. */
  hover: {
    onEnter: (anchor: HTMLElement) => void
    onLeave: () => void
  }
  onExpand: () => void
}) {
  const SectionIcon = getSectionIcon(section.id)
  const navLabel = useNavLabel()
  const location = useLocation()

  if (collapsed) {
    const entry = firstLinkInSection(section)
    const insideSection = findModuleByPath(location.pathname)?.section.id === section.id

    // Section without pages: nothing to navigate to, so keep the old behaviour.
    if (!entry) {
      return (
        <section className="sidebar__section">
          <button
            type="button"
            className="sidebar__item sidebar__section-icon-only"
            aria-label={navLabel(section)}
            onClick={onExpand}
            onMouseEnter={(event) => hover.onEnter(event.currentTarget)}
            onMouseLeave={hover.onLeave}
            onFocus={(event) => hover.onEnter(event.currentTarget)}
          >
            <span className="sidebar__icon">
              <SectionIcon />
            </span>
          </button>
        </section>
      )
    }

    return (
      <section className="sidebar__section">
        {/* Collapsed rail: the icon is a link, not an expander. Hovering still
            opens the module panel for picking a specific page. */}
        <NavLink
          to={insideSection ? location.pathname : entry.path}
          className={['sidebar__item', 'sidebar__section-icon-only', insideSection ? 'is-active' : '']
            .filter(Boolean)
            .join(' ')}
          aria-label={navLabel(section)}
          onClick={(event) => {
            // Already somewhere inside this section: don't push a history entry
            // (and don't jump back to the section's first page).
            if (insideSection) {
              event.preventDefault()
            }
          }}
          onMouseEnter={(event) => hover.onEnter(event.currentTarget)}
          onMouseLeave={hover.onLeave}
          onFocus={(event) => hover.onEnter(event.currentTarget)}
        >
          <span className="sidebar__icon">
            <SectionIcon />
          </span>
        </NavLink>
      </section>
    )
  }

  // A section with a single module has nothing to choose between: send the row
  // straight there and let the module tab bar handle the sub-pages.
  const onlyModule =
    section.children.length === 1 && section.children[0]?.kind === 'group'
      ? section.children[0]
      : null
  const firstPage = onlyModule
    ? onlyModule.children.find((child): child is SidebarLink => child.kind === 'link') ?? null
    : null

  if (onlyModule && firstPage) {
    const alreadyInside = findModuleByPath(location.pathname)?.module.id === onlyModule.id

    return (
      <section className="sidebar__section">
        <NavLink
          to={alreadyInside ? location.pathname : firstPage.path}
          title={navLabel(section)}
          onClick={(event) => {
            // Already there: don't push a duplicate history entry.
            if (alreadyInside) {
              event.preventDefault()
            }
          }}
          className={['sidebar__item', 'sidebar__group-toggle', flyout.open ? 'is-open' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <span className="sidebar__row-main">
            <span className="sidebar__icon">
              <SectionIcon />
            </span>
            <span className="sidebar__label">{navLabel(section)}</span>
          </span>
        </NavLink>
      </section>
    )
  }

  return (
    <section className="sidebar__section">
      <button
        type="button"
        className={['sidebar__item', 'sidebar__group-toggle', flyout.open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="true"
        aria-expanded={flyout.open}
        title={navLabel(section)}
        data-section-flyout="true"
        onMouseEnter={(event) => flyout.onEnter(event.currentTarget)}
        onMouseLeave={flyout.onLeave}
        onFocus={(event) => flyout.onEnter(event.currentTarget)}
        onClick={(event) => flyout.onActivate(event.currentTarget)}
      >
        <span className="sidebar__row-main">
          <span className="sidebar__icon">
            <SectionIcon />
          </span>
          <span className="sidebar__label">{navLabel(section)}</span>
        </span>
        <span className="sidebar__expander" aria-hidden>
          <IconChevron />
        </span>
      </button>
    </section>
  )
}

export function Sidebar() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const [query, setQuery] = useState('')
  const companyId = useCompanyStore((state) => state.companyId)
  const companyOptions = useCompanyStore((state) => state.companies)
  const companyGroups = useCompanyStore((state) => state.groups)
  const setCompanyData = useCompanyStore((state) => state.setData)
  const setActiveCompany = useCompanyStore((state) => state.setCompany)
  const setPreviewCompany = useCompanyStore((state) => state.setPreviewCompany)
  const [collapsed, setCollapsed] = useState(() => {
    return window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  })
  /**
   * Lives in the store, not in local state: the top company strip renders only
   * while this panel is open, so both components must agree on one value.
   */
  const companiesPanelOpen = useCompanyStore((state) => state.panelOpen)
  const setCompaniesPanelOpen = useCompanyStore((state) => state.setPanelOpen)
  const stripHovered = useCompanyStore((state) => state.stripHovered)
  const setPinnedGroup = useCompanyStore((state) => state.setPinnedGroup)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [flyoutSectionId, setFlyoutSectionId] = useState<string | null>(null)
  const [popoverAnchor, setPopoverAnchor] = useState({ top: 0, center: 0 })
  const [iconTipLabel, setIconTipLabel] = useState<string | null>(null)
  const hideFlyoutTimerRef = useRef<number | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => filterSidebarSections(query), [query])
  const { t } = useTranslation()
  const navLabel = useNavLabel()
  const currentSectionId = useMemo(
    () => findModuleByPath(location.pathname)?.section.id ?? null,
    [location.pathname],
  )
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
    window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    if (collapsed) {
      setHoveredGroupId(null)
      setCompaniesPanelOpen(false)
      setPreviewCompany(null)
    }
  }, [collapsed, setPreviewCompany])

  useEffect(() => {
    return () => {
      if (hideFlyoutTimerRef.current !== null) {
        window.clearTimeout(hideFlyoutTimerRef.current)
      }
    }
  }, [])

  /**
   * Hovering the top company strip holds the GROUP COMPANIES panel open (see
   * `scheduleHideFlyout`). Leaving the strip therefore has to end that
   * interaction the same way leaving the sidebar does - otherwise nothing would
   * ever close the panel again, since the pointer is far from the sidebar and no
   * sidebar mouseleave can fire. The 320ms grace still applies, so moving from
   * the strip back into the panel keeps it open.
   */
  useEffect(() => {
    if (!stripHovered) {
      return
    }
    // `scheduleHideFlyout` is re-created every render but only touches refs and
    // stable store setters, so the captured version stays correct.
    return () => scheduleHideFlyout()
  }, [stripHovered])

  useEffect(() => {
    if (flyoutSectionId === null && iconTipLabel === null && !companiesPanelOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (
        target.closest('.sidebar-flyout--modules') ||
        target.closest('.sidebar-flyout--groups') ||
        target.closest('[data-section-flyout="true"]') ||
        target.closest('[data-group-panel="true"]') ||
        // The top company strip is part of the GROUP COMPANIES interaction. A
        // pointerdown here must not close the panel, or the strip would unmount
        // before its click fires and the company would never be switched.
        target.closest('[data-company-strip="true"]')
      ) {
        return
      }
      closePopovers()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closePopovers()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [flyoutSectionId, iconTipLabel, companiesPanelOpen])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    let cancelled = false
    void loadGroupCompaniesData().then(({ companies, groups }) => {
      if (cancelled) {
        return
      }
      setCompanyData(companies, groups)
    })
    return () => {
      cancelled = true
    }
  }, [isHydrated, setCompanyData])

  async function handleLogout() {
    await logout()
  }

  function persistCompany(nextCompanyId: string) {
    setActiveCompany(nextCompanyId)
  }

  function cancelHideFlyout() {
    if (hideFlyoutTimerRef.current !== null) {
      window.clearTimeout(hideFlyoutTimerRef.current)
      hideFlyoutTimerRef.current = null
    }
  }

  function scheduleHideFlyout() {
    cancelHideFlyout()
    // The strip has no mouseleave to cancel the timer for us while the pointer is
    // parked on it; the strip itself drives the closing instead.
    if (useCompanyStore.getState().stripHovered) {
      return
    }
    hideFlyoutTimerRef.current = window.setTimeout(() => {
      hideFlyoutTimerRef.current = null
      // The pointer may have crossed onto the top company strip while this timer
      // was pending. Keep the panel open then: the strip's own mouseleave closes
      // it, and closing here would unmount the strip under the pointer.
      if (useCompanyStore.getState().stripHovered) {
        return
      }
      setHoveredGroupId(null)
      setFlyoutSectionId(null)
      setIconTipLabel(null)
      setCompaniesPanelOpen(false)
      setPreviewCompany(null)
    }, POPOVER_HIDE_DELAY_MS)
  }

  function closePopovers() {
    setHoveredGroupId(null)
    setFlyoutSectionId(null)
    setIconTipLabel(null)
    setCompaniesPanelOpen(false)
    setPreviewCompany(null)
  }

  function measureAnchor(anchor: HTMLElement) {
    const shell = shellRef.current
    if (!shell) {
      return
    }
    const shellRect = shell.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    setPopoverAnchor({
      top: Math.max(0, anchorRect.top - shellRect.top),
      center: Math.max(0, anchorRect.top - shellRect.top + anchorRect.height / 2),
    })
  }

  /**
   * Level-1 panel. A group has no page of its own: hovering it previews its
   * companies in the top company tabs, clicking it moves the active company
   * into that group.
   */
  function handleHoverCompaniesItem(item: Level2Item) {
    cancelHideFlyout()

    if (item.kind === 'company') {
      // Previewing a company previews *its* group - empty for standalone ones,
      // so the strip never keeps showing the previously previewed group.
      setHoveredGroupId(null)
      setPreviewCompany(item.id)
      return
    }

    setFlyoutSectionId(null)
    setIconTipLabel(null)
    setHoveredGroupId(item.id)
    setPreviewCompany(item.companies[0]?.value ?? null)
  }

  function handleOpenCompaniesPanel(anchor: HTMLElement) {
    cancelHideFlyout()
    setHoveredGroupId(null)
    setFlyoutSectionId(null)
    setIconTipLabel(null)
    measureAnchor(anchor)
    setCompaniesPanelOpen(true)
  }

  function handleOpenSectionFlyout(section: SidebarSection, anchor: HTMLElement) {
    cancelHideFlyout()
    setHoveredGroupId(null)
    setIconTipLabel(null)
    setPreviewCompany(null)
    setCompaniesPanelOpen(false)
    measureAnchor(anchor)
    setFlyoutSectionId(section.id)
  }

  /** Collapsed rail: sections with modules show the panel, the rest a name tip. */
  function handleHoverRailIcon(section: SidebarSection, anchor: HTMLElement) {
    if (collapsed && !hasModuleChoice(section)) {
      cancelHideFlyout()
      setHoveredGroupId(null)
      setFlyoutSectionId(null)
      setCompaniesPanelOpen(false)
      measureAnchor(anchor)
      setIconTipLabel(navLabel(section))
      return
    }
    handleOpenSectionFlyout(section, anchor)
  }

  /**
   * Level-2 row (a group) has no page of its own: clicking it is a *step*, not a
   * decision. It moves the active company into that group and holds the group's
   * companies in the top strip so the level-3 choice can be made there; the
   * strip only disappears once that company is picked (see CompanyTabs).
   * A standalone company is a leaf, so it clears any pending group.
   */
  function handleSelectLevel2(item: Level2Item) {
    if (item.kind === 'group') {
      const firstMemberId = item.companies[0]?.value
      if (firstMemberId) {
        persistCompany(firstMemberId)
      }
      setPinnedGroup(item.id)
      closePopovers()
      return
    }

    persistCompany(item.id)
    setPinnedGroup(null)
    closePopovers()
  }

  const activeCompany = companyOptions.find((item) => item.value === companyId) ?? null

  const highlightedLevel2Id =
    hoveredGroupId ??
    level2Items.find((item) => item.kind === 'company' && item.id === companyId)?.id ??
    null

  const flyoutSection = flyoutSectionId
    ? sections.find((section) => section.id === flyoutSectionId) ?? null
    : null

  return (
    <div
      ref={shellRef}
      className={['sidebar-shell', collapsed ? 'sidebar-shell--collapsed' : ''].filter(Boolean).join(' ')}
    >
      <aside
        className={['sidebar', collapsed ? 'sidebar--collapsed' : ''].filter(Boolean).join(' ')}
        aria-label={t('shell.primaryNav')}
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
          aria-label={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          title={collapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
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
          placeholder={t('sidebar.search')}
          aria-label={t('sidebar.searchAria')}
        />
      </div>

      {!collapsed && activeCompany ? (
        <div className="sidebar__company-context" title={activeCompany.label}>
          <span className="sidebar__company-context-label">{t('sidebar.activeCompany')}</span>
          <strong className="sidebar__company-context-name">{activeCompany.label}</strong>
        </div>
      ) : null}

      {!collapsed ? (
        <div className="sidebar__context">
          <GroupCompaniesBlock
            open={companiesPanelOpen}
            onOpen={handleOpenCompaniesPanel}
            onLeave={scheduleHideFlyout}
          />
        </div>
      ) : null}

      {collapsed ? (
        <div className="sidebar__rail-context">
          <button
            type="button"
            className="sidebar__item sidebar__section-icon-only"
            aria-label={t('sidebar.groupCompanies')}
            aria-haspopup="true"
            aria-expanded={companiesPanelOpen}
            data-group-panel="true"
            onMouseEnter={(event) => handleOpenCompaniesPanel(event.currentTarget)}
            onMouseLeave={scheduleHideFlyout}
            onFocus={(event) => handleOpenCompaniesPanel(event.currentTarget)}
            onClick={() => setCollapsed(false)}
          >
            <span className="sidebar__icon">
              <IconBuilding />
            </span>
          </button>
        </div>
      ) : null}

      <nav className="sidebar__nav">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            flyout={{
              open: flyoutSectionId === section.id || currentSectionId === section.id,
              onEnter: (anchor) => handleOpenSectionFlyout(section, anchor),
              onLeave: scheduleHideFlyout,
              onActivate: (anchor) => handleOpenSectionFlyout(section, anchor),
            }}
            hover={{
              onEnter: (anchor) => handleHoverRailIcon(section, anchor),
              onLeave: scheduleHideFlyout,
            }}
            onExpand={() => setCollapsed(false)}
          />
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__avatar" aria-hidden>
          {initials}
        </div>
        <div className="sidebar__user">
          <strong>{user?.name ?? t('sidebar.fallbackUser')}</strong>
          <span>{user?.email ?? ''}</span>
        </div>
        <button
          type="button"
          className="sidebar__logout"
          aria-label={t('sidebar.logout')}
          title={t('sidebar.logout')}
          onClick={() => void handleLogout()}
        >
          <IconLogout />
        </button>
      </div>
      </aside>

      {companiesPanelOpen ? (
        <GroupCompaniesPanel
          items={level2Items}
          highlightedLevel2Id={highlightedLevel2Id}
          top={popoverAnchor.top}
          onHoverItem={handleHoverCompaniesItem}
          onSelectItem={handleSelectLevel2}
          onMouseEnter={cancelHideFlyout}
          onMouseLeave={scheduleHideFlyout}
        />
      ) : null}

      {flyoutSection ? (
        <SectionModulesFlyout
          section={flyoutSection}
          top={popoverAnchor.top}
          onMouseEnter={cancelHideFlyout}
          onMouseLeave={scheduleHideFlyout}
          onNavigate={closePopovers}
        />
      ) : null}

      {iconTipLabel ? (
        <div className="sidebar-tip" role="tooltip" style={{ top: popoverAnchor.center }}>
          {iconTipLabel}
        </div>
      ) : null}
    </div>
  )
}
