import {
  NavLink,
  useLocation,
} from 'react-router-dom'

export function AiSettingsNav() {
  const location = useLocation()

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
            to="/ai/ai/ai-settings/models"
            className={['ai-settings-nav__link', 'ai-settings-nav__link--nested', onProviderModels || location.pathname === '/ai/ai/ai-settings/models' ? 'is-active' : ''].filter(Boolean).join(' ')}
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

          <NavLink to="/ai/ai/ai-settings/usage-cost" className={({ isActive }) => ['ai-settings-nav__link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}>Usage &amp; Cost</NavLink>
        </div>
      </nav>
    </aside>
  )
}
