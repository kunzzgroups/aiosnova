import { useAuthStore } from '@/stores/authStore'
import type { ChatStreamInput } from './chatStreamService'

const endpoint = '/api/ai/chat/messages/tools'

function headers(requestId: string): HeadersInit {
  if (!requestId.trim()) throw new Error('Tool chat request ID is required.')
  const token = useAuthStore.getState().accessToken
  if (!token) throw new Error('Sign in before using tool chat.')
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-AI-Tool-Request-Id': requestId,
  }
}

async function readResponse(response: Response): Promise<unknown> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`Invalid tool chat response. HTTP status: ${response.status}`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null &&
      'message' in body && typeof body.message === 'string'
      ? body.message : `Tool chat failed. HTTP status: ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function sendToolChat(
  input: ChatStreamInput,
  agentId: string,
  requestId: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  if (!agentId.trim()) throw new Error('Select an Agent for tool chat.')
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: headers(requestId),
    signal,
    body: JSON.stringify({ ...input, agentId }),
  })
  signal.throwIfAborted()
  const body = await readResponse(response)
  signal.throwIfAborted()
  if (typeof body !== 'object' || body === null ||
      !('modelId' in body) || body.modelId !== input.modelId ||
      !('reply' in body) || typeof body.reply !== 'string' || !body.reply.trim()) {
    throw new Error('Invalid tool chat reply.')
  }
  return body.reply
}

export async function cancelToolChat(
  companyId: string,
  agentId: string,
  requestId: string,
): Promise<void> {
  const response = await fetch(`${endpoint}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: headers(requestId),
    keepalive: true,
    signal: AbortSignal.timeout(3000),
    body: JSON.stringify({ companyId, agentId }),
  })
  await readResponse(response)
}
