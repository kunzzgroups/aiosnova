import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findCompanyGroup, useCompanyStore } from '@/stores/companyStore'
import './TopTabs.css'

/**
 * Company switcher for the top bar.
 *
 * Visibility and content are resolved in this order:
 *   1. `previewCompanyId` - hovering a row in the sidebar GROUP COMPANIES panel
 *      previews that entry (a standalone company previews as empty).
 *   2. `pinnedGroupId`    - the group the user clicked. It keeps the strip on
 *      screen after the panel closes, so picking a group leaves its companies
 *      visible instead of making the whole strip vanish.
 *   3. `panelOpen`        - while the panel is open and nothing is hovered yet,
 *      fall back to the active company's group.
 * Nothing to show -> no strip at all. A company with no group shows nothing -
 * never a stale group from before.
 */
export function CompanyTabs() {
  const companies = useCompanyStore((state) => state.companies)
  const groups = useCompanyStore((state) => state.groups)
  const companyId = useCompanyStore((state) => state.companyId)
  const previewCompanyId = useCompanyStore((state) => state.previewCompanyId)
  const pinnedGroupId = useCompanyStore((state) => state.pinnedGroupId)
  const panelOpen = useCompanyStore((state) => state.panelOpen)
  const setCompany = useCompanyStore((state) => state.setCompany)
  const setPanelOpen = useCompanyStore((state) => state.setPanelOpen)
  const setPreviewCompany = useCompanyStore((state) => state.setPreviewCompany)
  const setStripHovered = useCompanyStore((state) => state.setStripHovered)
  const setPinnedGroup = useCompanyStore((state) => state.setPinnedGroup)
  const { t } = useTranslation()

  const group = useMemo(() => {
    if (previewCompanyId) {
      return findCompanyGroup(groups, previewCompanyId)
    }
    if (pinnedGroupId) {
      return groups.find((item) => item.id === pinnedGroupId) ?? null
    }
    return panelOpen ? findCompanyGroup(groups, companyId) : null
  }, [previewCompanyId, pinnedGroupId, panelOpen, groups, companyId])

  const members = useMemo(() => {
    if (!group) {
      return []
    }
    const byId = new Map(companies.map((item) => [item.value, item]))
    return group.companyIds
      .map((id) => byId.get(id))
      .filter((item): item is { value: string; label: string } => Boolean(item))
  }, [group, companies])

  // Nothing to preview -> no strip at all.
  if (!group || members.length < 2) {
    return null
  }

  // Narrowed once here: the closure below cannot rely on the early return.
  const groupId = group.id

  /**
   * Picking a company switches the active company and keeps this group selected,
   * so the strip stays where it is instead of collapsing after every switch.
   */
  function handleSelect(memberId: string) {
    setCompany(memberId)
    setPreviewCompany(null)
    setPinnedGroup(groupId)
    setPanelOpen(false)
  }

  return (
    <nav
      className="top-tabs"
      aria-label={t('sidebar.companiesInGroup', { group: group.name })}
      data-company-strip="true"
      // The strip lives outside the sidebar, so it has to keep the panel's hover
      // grace alive while the pointer travels up to it (and cancel it on leave).
      onMouseEnter={() => setStripHovered(true)}
      onMouseLeave={() => setStripHovered(false)}
    >
      <div className="top-tabs__inner">
        {members.map((company) => {
          const active = company.value === companyId
          return (
            <button
              key={company.value}
              type="button"
              className={['top-tabs__tab', active ? 'top-tabs__tab--active' : ''].filter(Boolean).join(' ')}
              aria-current={active ? 'true' : undefined}
              onClick={() => handleSelect(company.value)}
            >
              {company.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
