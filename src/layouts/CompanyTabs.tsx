import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findCompanyGroup, useCompanyStore } from '@/stores/companyStore'
import './TopTabs.css'

/**
 * Company switcher for the top bar. Shows the companies of the group that owns
 * the active company, or of the company being previewed from the sidebar panel.
 * A company with no group shows nothing - never a stale group from before.
 */
export function CompanyTabs() {
  const companies = useCompanyStore((state) => state.companies)
  const groups = useCompanyStore((state) => state.groups)
  const companyId = useCompanyStore((state) => state.companyId)
  const previewCompanyId = useCompanyStore((state) => state.previewCompanyId)
  const setCompany = useCompanyStore((state) => state.setCompany)
  const { t } = useTranslation()

  const group = useMemo(
    () => findCompanyGroup(groups, previewCompanyId ?? companyId),
    [groups, previewCompanyId, companyId],
  )

  const members = useMemo(() => {
    if (!group) {
      return []
    }
    const byId = new Map(companies.map((item) => [item.value, item]))
    return group.companyIds
      .map((id) => byId.get(id))
      .filter((item): item is { value: string; label: string } => Boolean(item))
  }, [group, companies])

  // Nothing to switch between -> no strip at all.
  if (!group || members.length < 2) {
    return null
  }

  return (
    <nav className="top-tabs" aria-label={t('sidebar.companiesInGroup', { group: group.name })}>
      <div className="top-tabs__inner">
        {members.map((company) => {
          const active = company.value === companyId
          return (
            <button
              key={company.value}
              type="button"
              className={['top-tabs__tab', active ? 'top-tabs__tab--active' : ''].filter(Boolean).join(' ')}
              aria-current={active ? 'true' : undefined}
              onClick={() => setCompany(company.value)}
            >
              {company.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
