export type ConnectionTestInput = {
  baseUrl: string
  apiKey: string
  modelId: string
}

export type ConnectionTestResult = {
  ok: boolean
  message: string
  reply?: string
}

export async function testModelConnection(
  input: ConnectionTestInput
): Promise<ConnectionTestResult> {
  const response = await fetch('/api/ai/test-connection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`后端请求失败，HTTP 状态码：${response.status}`)
  }

  const result: ConnectionTestResult = await response.json()

  return result
}
