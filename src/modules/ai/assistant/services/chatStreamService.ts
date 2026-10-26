export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ChatStreamInput = {
  companyId: string
  providerId: string
  modelId: string
  temperature?: number
  messages: {
    role: 'system' | 'user' | 'assistant'
    content: string | ChatContentPart[]
  }[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function streamAssistantChat(
  input: ChatStreamInput,
  options: {
    signal: AbortSignal
    onText: (text: string) => void
  },
): Promise<string> {
  const response = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let message = `Chat request failed. HTTP status: ${response.status}`

    try {
      const body: unknown = await response.json()

      if (isObject(body) && typeof body.message === 'string') {
        message = body.message
      } else if (isObject(body) && typeof body.detail === 'string') {
        message = body.detail
      }
    } catch {
      // 没有 JSON 正文时，使用状态码提示。
    }

    throw new Error(message)
  }

  if (
    !response.body ||
    !response.headers.get('Content-Type')?.includes('text/event-stream')
  ) {
    throw new Error('The server did not return the expected event stream.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventLines: string[] = []
  let eventSize = 0
  let full = ''
  let receivedDone = false

  function consumeEvent() {
    if (eventLines.length === 0) return

    const payload = eventLines.join('\n').trim()
    eventLines = []
    eventSize = 0

    if (!payload) return

    if (payload === '[DONE]') {
      receivedDone = true
      return
    }

    let event: unknown

    try {
      event = JSON.parse(payload)
    } catch {
      throw new Error('The model stream contains invalid JSON.')
    }

    if (!isObject(event)) {
      throw new Error('Invalid model stream format.')
    }

    if (event.error) {
      const error = event.error

      throw new Error(
        isObject(error) && typeof error.message === 'string'
          ? error.message
          : 'The model streaming request failed.',
      )
    }

    const choice = Array.isArray(event.choices)
      ? event.choices[0]
      : undefined

    if (!isObject(choice)) return

    if (choice.finish_reason === 'length') {
      throw new Error('The model reached its output limit. The reply may be incomplete.')
    }

    if (choice.finish_reason === 'content_filter') {
      throw new Error('The model output was filtered.')
    }

    if (choice.finish_reason === 'tool_calls') {
      throw new Error('This chat endpoint does not yet support tool execution.')
    }

    const delta = choice.delta

    // 只读取回答文字，不显示 reasoning 等其他字段。
    if (isObject(delta) && typeof delta.content === 'string') {
      full += delta.content
      options.onText(full)
    }
  }

  function consumeLine(line: string) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line

    if (normalized === '') {
      consumeEvent()
      return
    }

    if (!normalized.startsWith('data:')) return

    const data = normalized.slice(5).replace(/^ /, '')
    eventSize += data.length

    if (eventSize > 262144) {
      throw new Error('An event in the stream is too large.')
    }

    eventLines.push(data)
  }

  try {
    while (!receivedDone) {
      const { done, value } = await reader.read()

      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true })

      let newline: number

      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        consumeLine(line)

        if (receivedDone) break
      }

      if (buffer.length > 262144) {
        throw new Error('Invalid streaming response data.')
      }

      if (done) {
        if (!receivedDone) {
          if (buffer) consumeLine(buffer)
          consumeEvent()
        }
        break
      }
    }

    if (options.signal.aborted) {
      throw new DOMException('Request cancelled', 'AbortError')
    }

    if (!receivedDone) {
      throw new Error('The model connection ended without a completion marker.')
    }

    if (!full.trim()) {
      throw new Error('The model returned no valid text reply.')
    }

    return full
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
