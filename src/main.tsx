import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { hydrateSession } from '@/modules/core/auth/services/authService'
import '@/design-system/global.css'

async function enableMocking() {
  const shouldMock = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCK === 'true'
  if (!shouldMock) {
    return
  }

  const { worker } = await import('@/mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
  })
}

async function bootstrap() {
  await enableMocking()
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
