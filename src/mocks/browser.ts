import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'
import { identityHandlers } from '@/mocks/handlers/identityHandlers'
import { agentHandlers } from '@/mocks/handlers/agentHandlers'
import { knowledgeHandlers } from '@/mocks/handlers/knowledgeHandlers'

const backendTacHandlers = [
  http.post('/api/auth/local-test-login', () => passthrough()),
  http.all('/api/identity/organizations', () => passthrough()),
  http.all('/api/identity/organizations/:id', () => passthrough()),
  http.all('/api/identity/positions', () => passthrough()),
  http.all('/api/identity/positions/:id', () => passthrough()),
  http.all('/api/identity/organization-companies', () => passthrough()),
  http.all('/api/identity/organization-batches', () => passthrough()),
  http.post('/api/auth/login/tac/send', () => passthrough()),
  http.get('/api/mock/inbox', () => passthrough()),
  http.post('/api/mock/invitations', () => passthrough()),
  http.get('/api/mock/invitations/:token', () => passthrough()),
  http.post('/api/mock/invitations/:token/mfa/start', () => passthrough()),
]
export const worker = setupWorker(
  ...backendTacHandlers,
  ...authHandlers,
  ...identityHandlers,
  ...agentHandlers,
  ...knowledgeHandlers,
)
