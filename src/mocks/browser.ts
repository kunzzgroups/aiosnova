import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'
import { identityHandlers } from '@/mocks/handlers/identityHandlers'
import { agentHandlers } from '@/mocks/handlers/agentHandlers'
import { knowledgeHandlers } from '@/mocks/handlers/knowledgeHandlers'

const backendTacHandlers = [
  http.get('/api/identity/organizations/:id/removal-impact', () => passthrough()),
  http.post('/api/identity/organizations/:id/remove', () => passthrough()),
  http.delete('/api/identity/users/:id', () => passthrough()),
  http.post('/api/identity/users/bulk-delete', () => passthrough()),
  http.get('/api/identity/invitation-organization', () => passthrough()),
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
  http.post('/api/identity/roles', () => passthrough()),
  http.get('/api/identity/roles', () => passthrough()),
  http.patch('/api/identity/roles/:id', () => passthrough()),
  http.patch('/api/identity/roles/:id/status', () => passthrough()),
  http.post('/api/ai/test-connection', () => passthrough()),
  http.get('/api/ai/model-capabilities', () => passthrough()),
  http.get('/api/ai/openrouter/models', () => passthrough()),
  http.get('/api/ai/models', () => passthrough()),
  http.post('/api/ai/models/sync', () => passthrough()),
  http.patch('/api/ai/models/:id/enabled', () => passthrough()),
]
export const worker = setupWorker(
  ...backendTacHandlers,
  ...authHandlers,
  ...identityHandlers,
  ...agentHandlers,
  ...knowledgeHandlers,
)
