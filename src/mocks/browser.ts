import { setupWorker } from 'msw/browser'
import { authHandlers } from '@/mocks/handlers/authHandlers'

export const worker = setupWorker(...authHandlers)
