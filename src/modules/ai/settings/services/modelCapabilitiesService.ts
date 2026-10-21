export type ModelCapabilities = {
    chat: boolean
    vision: boolean
    toolCalling: boolean
    contextWindow: number | null
}

type CapabilitiesResponse =
    | {
        ok: true
        modelId: string
        capabilities: ModelCapabilities
    }
    | {
        ok: false
        message: string
    }

export async function fetchModelCapabilities(
    modelId: string
): Promise<ModelCapabilities> {
    const normalizedId = modelId.trim()

    if (!normalizedId) {
        throw new Error('请填写模型 ID。')
    }

    const query = new URLSearchParams({
        modelId: normalizedId,
    })

    const response = await fetch(
        `/api/ai/model-capabilities?${query.toString()}`
    )

    if (!response.ok) {
        throw new Error(
            `后端请求失败，HTTP 状态码：${response.status}`
        )
    }

    const result: CapabilitiesResponse = await response.json()

    if (!result.ok) {
        throw new Error(result.message)
    }

    return result.capabilities
}
