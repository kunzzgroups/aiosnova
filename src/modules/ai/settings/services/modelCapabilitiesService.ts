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
        throw new Error('Enter a model ID.')
    }

    const query = new URLSearchParams({
        modelId: normalizedId,
    })

    const response = await fetch(
        `/api/ai/model-capabilities?${query.toString()}`
    )

    if (!response.ok) {
        throw new Error(
            `Server request failed. HTTP status: ${response.status}`
        )
    }

    const result: CapabilitiesResponse = await response.json()

    if (!result.ok) {
        throw new Error(result.message)
    }

    return result.capabilities
}
