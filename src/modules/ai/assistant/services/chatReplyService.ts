import {
  streamAssistantChat,
  type ChatStreamInput,
} from './chatStreamService'

export const toolChatPreview =
  import.meta.env.DEV &&
  import.meta.env.VITE_AI_TOOL_CHAT_PREVIEW === 'true'

export const toolChatLocalSimulation =
  import.meta.env.DEV &&
  import.meta.env.VITE_AI_TOOL_CHAT_LOCAL_SIMULATION === 'true'

async function cancelLocalSimulation(requestId: string): Promise<void> {
  // Cancellation may arrive before the chat request is registered.
  // Retry only cancellation notifications, never the chat itself.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(
        '/api/ai/tool-chat-simulation/cancel',
        {
          method: 'POST',
          headers: {
            'X-AI-Simulation-Request-Id': requestId,
          },
          keepalive: true,
          signal: AbortSignal.timeout(1000),
        },
      )

      if (response.status === 202) return

      if (response.status !== 404) {
        console.warn(
          `Simulation cancellation was not accepted: ${response.status}`,
        )
        return
      }
    } catch {
      console.warn('Could not confirm cancellation of the Java simulation.')
      return
    }

    if (attempt < 9) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // 404 can also mean the original request has already completed.
  console.info('No active Java simulation request was found for cancellation.')
}

export async function requestAssistantReply(
  input: ChatStreamInput,
  options: {
    signal: AbortSignal
    onText: (text: string) => void
  },
  agentId?: string,
): Promise<string> {
  options.signal.throwIfAborted()
  if (toolChatPreview && toolChatLocalSimulation) {
    throw new Error('Enable only one tool chat simulation mode.')
  }

  if (!toolChatPreview && !toolChatLocalSimulation) {
    return streamAssistantChat(input, options)
  }

  if (!agentId) {
    throw new Error('Select an Agent for the tool chat preview.')
  }

  const requestId = toolChatLocalSimulation
    ? crypto.randomUUID()
    : undefined

  const onAbort = () => {
    if (requestId) {
      void cancelLocalSimulation(requestId)
    }
  }

  if (requestId) {
    options.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    options.signal.throwIfAborted()

    const response = await fetch(
      toolChatLocalSimulation
        ? '/api/ai/tool-chat-simulation'
        : '/api/ai/chat/messages/tools',
      {
        method: 'POST',
        signal: options.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(requestId
            ? { 'X-AI-Simulation-Request-Id': requestId }
            : {}),
        },
        body: JSON.stringify({
          ...input,
          agentId,
          ...(toolChatLocalSimulation
            ? {
              providerId: 'provider-test',
              modelId: 'test/model',
            }
            : {}),
        }),
      },
    )

    let body: unknown
    try {
      body = await response.json()
    } catch {
      options.signal.throwIfAborted()
      throw new Error(`Invalid tool chat response. HTTP status: ${response.status}`)
    }

    options.signal.throwIfAborted()

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      throw new Error('Invalid tool chat response.')
    }

    const result = body as Record<string, unknown>

    if (!response.ok) {
      throw new Error(
        typeof result.message === 'string'
          ? result.message
          : `Tool chat failed. HTTP status: ${response.status}`,
      )
    }

    if (
      result.modelId !== (
        toolChatLocalSimulation ? 'test/model' : input.modelId
      ) ||
      typeof result.reply !== 'string' ||
      !result.reply.trim()
    ) {
      throw new Error('Invalid tool chat reply.')
    }

    options.signal.throwIfAborted()
    const reply = toolChatLocalSimulation
      ? `[Local Java simulation] ${result.reply}`
      : result.reply

    options.onText(reply)

    return reply
  } finally {
    if (requestId) {
      options.signal.removeEventListener('abort', onAbort)
    }
  }
}
