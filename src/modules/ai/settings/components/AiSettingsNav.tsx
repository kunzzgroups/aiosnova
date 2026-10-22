import { useEffect, useState } from 'react'
import { useCompanyStore } from '@/stores/companyStore'
import { fetchProviders } from '../services/settingsService'
import { chooseModelProvider, rememberModelProvider, MODEL_PROVIDER_SELECTION_EVENT } from '../services/modelProviderSelection'
import {
  NavLink,
  useLocation,
  useMatch,
} from 'react-router-dom'

export function AiSettingsNav() {
  const location = useLocation()
  const companyId = useCompanyStore((state) => state.companyId)
  const routeProviderId = useMatch('/ai/ai/ai-settings/models/providers/:providerId/models')?.params.providerId ?? ''
  const [selection, setSelection] = useState({ companyId: '', providerId: '' })
  const defaultProviderId = selection.companyId === companyId ? selection.providerId : ''
  useEffect(() => {
    let active = true
    let availableIds: string[] = []
    const refreshSelection = () => {
      if (active) setSelection({ companyId, providerId: chooseModelProvider(companyId, availableIds, routeProviderId) })
    }
    setSelection({ companyId, providerId: '' })
    window.addEventListener(MODEL_PROVIDER_SELECTION_EVENT, refreshSelection)
    void fetchProviders(companyId).then((result) => {
      if (!active) return
      availableIds = result.items.map(provider => provider.id)
      if (availableIds.includes(routeProviderId)) rememberModelProvider(companyId, routeProviderId)
      refreshSelection()
    }).catch(() => { if (active) setSelection({ companyId, providerId: '' }) })
    return () => {
      active = false
      window.removeEventListener(MODEL_PROVIDER_SELECTION_EVENT, refreshSelection)
    }
  }, [companyId, location.pathname, routeProviderId])

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

        <div className="ai-settings-nav__section">
          <div className="ai-settings-nav__section-label">
            Governance
          </div>

          <NavLink to="/ai/ai/ai-settings/security-limits" className={({ isActive }) => ['ai-settings-nav__link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}>Security &amp; Limits</NavLink>

        </div>
      </nav>
    </aside>
  )
}
