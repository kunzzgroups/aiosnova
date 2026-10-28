import { delay, http, HttpResponse, passthrough } from 'msw'

export const toolChatLocalSimulationHandlers = [
  '/api/ai/tool-chat-simulation',
  '/api/ai/tool-chat-simulation/cancel',
].map(path => http.post(path, () => {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_AI_TOOL_CHAT_LOCAL_SIMULATION === 'true' &&
    import.meta.env.VITE_AI_TOOL_CHAT_PREVIEW !== 'true'
  ) {
    return passthrough()
  }

  return HttpResponse.json(
    { message: 'Local Java simulation is disabled.' },
    { status: 503 },
  )
}))

export const toolChatPreviewHandlers = [
  http.post('/api/ai/chat/messages/tools', async ({ request }) => {
    // Never pass this preview endpoint through to Java.
    if (
      !import.meta.env.DEV ||
      import.meta.env.VITE_AI_TOOL_CHAT_PREVIEW !== 'true'
    ) {
      return HttpResponse.json(
        { message: 'Tool chat preview is disabled.' },
        { status: 503 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return HttpResponse.json({ message: 'Invalid preview JSON.' }, { status: 400 })
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return HttpResponse.json({ message: 'Invalid preview request.' }, { status: 400 })
    }
    const body = payload as Record<string, unknown>

    if (
      body.companyId !== 'company-j1' ||
      body.agentId !== '4115e177-5d14-4b54-b6c5-7105609f3166'
    ) {
      return HttpResponse.json(
        { message: 'Preview Agent or company is not allowed.' },
        { status: 403 },
      )
    }

    if (
      typeof body.providerId !== 'string' || !body.providerId.trim() ||
      typeof body.modelId !== 'string' || !body.modelId.trim() ||
      !Array.isArray(body.messages) || !body.messages.length ||
      body.messages.some(message =>
        !message || typeof message !== 'object' ||
        !['system', 'user', 'assistant'].includes(message.role) ||
        !(typeof message.content === 'string' || Array.isArray(message.content))
      )
    ) {
      return HttpResponse.json(
        { message: 'Invalid preview request.' },
        { status: 400 },
      )
    }

    const lastUser = [...body.messages]
      .reverse()
      .find(message => message.role === 'user')

    if (lastUser?.content === 'preview-denied') {
      return HttpResponse.json(
        { message: 'Preview: this Agent cannot use the Calculator.' },
        { status: 403 },
      )
    }

    if (lastUser?.content === 'preview-failure') {
      return HttpResponse.json(
        { message: 'Preview: tool execution failed. No retry was made.' },
        { status: 502 },
      )
    }

    if (lastUser?.content !== 'Calculate 2 + 3.') {
      return HttpResponse.json(
        { message: 'Preview supports: Calculate 2 + 3.' },
        { status: 400 },
      )
    }

    await delay(1200)

    return HttpResponse.json({
      modelId: body.modelId,
      reply: '[Preview] The answer is 5.',
    })
  }),
]
