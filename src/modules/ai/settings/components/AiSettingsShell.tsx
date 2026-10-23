import type { ReactNode } from 'react'

import { AiSettingsNav } from './AiSettingsNav'

type AiSettingsShellProps = {
  children: ReactNode
  title?: string
  description?: string
  actions?: ReactNode
}

export function AiSettingsShell({
  children,
  title,
  description,
  actions,
}: AiSettingsShellProps) {
  return (
    <div className="console-page ai-settings-page">
      <div className="ai-settings-shell">
        <AiSettingsNav />

        <main className="ai-settings-main">
          {title ? (
            <header className="ai-settings-page-header">
              <div>
                <h1>{title}</h1>

                {description ? (
                  <p>{description}</p>
                ) : null}
              </div>
              {actions}
            </header>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  )
}