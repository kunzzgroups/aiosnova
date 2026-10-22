import type { ModelCapabilities } from './modelCapabilitiesService'

export type CatalogModel = {
    modelId: string
    name: string
    description: string
    capabilities: ModelCapabilities | null
    capabilityError: string | null
}

type CatalogResponse =
    | {
        ok: true
        source: 'openrouter'
        items: CatalogModel[]
        count: number
        checkedAt: string
    }
    | {
        ok: false
        message: string
    }

export async function fetchOpenRouterModelCatalog() {
    const response = await fetch('/api/ai/openrouter/models')

    if (!response.ok) {
        throw new Error(
            `读取模型目录失败，HTTP 状态码：${response.status}`
        )
    }

    const result: CatalogResponse = await response.json()

    if (!result.ok) {
        throw new Error(result.message)
    }

    if (
        result.source !== 'openrouter' ||
        !Array.isArray(result.items) ||
        result.items.length === 0 ||
        result.count !== result.items.length ||
        !Number.isFinite(Date.parse(result.checkedAt))
    ) {
        throw new Error('模型目录为空或格式异常，未执行同步。')
    }

    return result
}