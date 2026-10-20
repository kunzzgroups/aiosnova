import { useEffect, useState } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchProviders } from '../services/settingsService'
import {
  NavLink,
  useLocation,
} from 'react-router-dom'

export function AiSettingsNav() {
  const location = useLocation()
  const companyId = useCompanyStore((state) => state.companyId)
  const [defaultProviderId, setDefaultProviderId] = useState('')
  useEffect(() => {
    let active = true
    setDefaultProviderId('')
    void fetchProviders(companyId).then((result) => {
      if (active) setDefaultProviderId(result.items[0]?.id ?? '')
    }).catch(() => { if (active) setDefaultProviderId('') })
    return () => { active = false }
  }, [companyId, location.pathname])

  const onProviderModels =
    location.pathname.includes(
      '/ai/ai/ai-settings/models/providers/',
    ) &&
    location.pathname.endsWith(
      '/models',
    )

  return (
    <aside
      className="ai-settings-nav"
      aria-label="AI Settings sections"
    >
      <nav className="ai-settings-nav__items">
        <NavLink
          end
          to="/ai/ai/ai-settings"
          className={({ isActive }) =>
            [
              'ai-settings-nav__link',
              isActive
                ? 'is-active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
        >
          Overview
        </NavLink>

        <div className="ai-settings-nav__section">
          <div className="ai-settings-nav__section-label">
            Models
          </div>

          <NavLink
            to="/ai/ai/ai-settings/models/providers"
            className={({ isActive }) =>
              [
                'ai-settings-nav__link',
                'ai-settings-nav__link--nested',
                isActive &&
                !onProviderModels
                  ? 'is-active'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
          >
            Providers
          </NavLink>

          <NavLink
            to={onProviderModels ? location.pathname : defaultProviderId ? `/ai/ai/ai-settings/models/providers/${defaultProviderId}/models` : '/ai/ai/ai-settings/models/providers'}
            className={['ai-settings-nav__link', 'ai-settings-nav__link--nested', onProviderModels ? 'is-active' : ''].filter(Boolean).join(' ')}
          >
            Models
          </NavLink>
        </div>

        <div className="ai-settings-nav__section">
          <div className="ai-settings-nav__section-label">
            Capabilities
          </div>

          <NavLink to="/ai/ai/ai-settings/tools" className={({ isActive }) => ['ai-settings-nav__link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}>Tools</NavLink>

          <NavLink to="/ai/ai/ai-settings/mcp" className={({ isActive }) => ['ai-settings-nav__link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}>MCP</NavLink>
        </div>
      </nav>
    </aside>
  )
}
