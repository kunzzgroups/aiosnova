import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'
import { identityHandlers } from '@/mocks/handlers/identityHandlers'

const backendTacHandlers = [
  http.post('/api/auth/login/tac/send', () => passthrough()),
  http.get('/api/mock/inbox', () => passthrough()),
]
export const worker = setupWorker(...backendTacHandlers, ...authHandlers, ...identityHandlers)
