import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'
import { identityHandlers } from '@/mocks/handlers/identityHandlers'
import { agentHandlers } from '@/mocks/handlers/agentHandlers'
import { knowledgeHandlers } from '@/mocks/handlers/knowledgeHandlers'

<<<<<<< HEAD
const backendTacHandlers = [
  http.post('/api/auth/login/tac/send', () => passthrough()),
  http.get('/api/mock/inbox', () => passthrough()),
]
export const worker = setupWorker(...backendTacHandlers, ...authHandlers, ...identityHandlers)
=======
export const worker = setupWorker(
  ...authHandlers,
  ...identityHandlers,
  ...agentHandlers,
  ...knowledgeHandlers,
)
>>>>>>> origin/main
