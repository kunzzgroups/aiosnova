import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { hydrateSession } from '@/modules/core/auth/services/authService'
import { ensureMocking } from '@/mocks/runtime'
import '@/i18n'
import { applyTheme, useThemeStore } from '@/stores/themeStore'
import '@/design-system/global.css'

applyTheme(useThemeStore.getState().theme)

async function bootstrap() {
  await ensureMocking()
  await hydrateSession()

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element not found')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
