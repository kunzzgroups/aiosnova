import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'
import { identityHandlers } from '@/mocks/handlers/identityHandlers'
import { agentHandlers } from '@/mocks/handlers/agentHandlers'
import { knowledgeHandlers } from '@/mocks/handlers/knowledgeHandlers'

export const worker = setupWorker(
  ...authHandlers,
  ...identityHandlers,
  ...agentHandlers,
  ...knowledgeHandlers,
)
