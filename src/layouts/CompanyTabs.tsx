import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findCompanyGroup, useCompanyStore } from '@/stores/companyStore'
import './TopTabs.css'

/**
 * Company picker strip for the top bar - the level-3 half of the GROUP
 * COMPANIES drill-down.
 *
 * The flow it exists for: click a level-2 row (a group) in the sidebar panel ->
 * that group's companies land here -> pick one -> the strip disappears again.
 * Clicking a group is a step, not a decision, so the strip stays up until a
 * company is actually chosen. It is deliberately NOT a permanent row, or it
 * would cost a full line of height on every page for something used a few times
 * a day.
 *
 * Resolution order:
 *   1. hovered row  (`previewCompanyId`) - live preview; a standalone company
 *      previews as empty, never as the previously previewed group.
 *   2. clicked group (`pinnedGroupId`)   - the pending choice, outlives the panel.
 *   3. panel just opened                - fall back to the active company's group.
 */
export function CompanyTabs() {
  const companies = useCompanyStore((state) => state.companies)
  const groups = useCompanyStore((state) => state.groups)
  const companyId = useCompanyStore((state) => state.companyId)
  const previewCompanyId = useCompanyStore((state) => state.previewCompanyId)
  const panelOpen = useCompanyStore((state) => state.panelOpen)
  const pinnedGroupId = useCompanyStore((state) => state.pinnedGroupId)
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

  // Nothing to pick -> no strip at all.
  if (!group || members.length < 2) {
    return null
  }

  /**
   * The decision. Switching company ends the drill-down, so the pending group is
   * cleared and the strip goes away.
   */
  function handleSelect(memberId: string) {
    setCompany(memberId)
    setPreviewCompany(null)
    setPinnedGroup(null)
    setPanelOpen(false)
  }

  return (
    <nav
      className="top-tabs"
      aria-label={t('sidebar.companiesInGroup', { group: group.name })}
      data-company-strip="true"
      // The strip lives outside the sidebar, so it has to keep the panel's hover
      // grace alive while the pointer travels up to it (and release it on leave).
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
