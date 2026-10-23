import type { ModelCapabilities } from './modelCapabilitiesService'

type ExecutionRequirements = {
    hasImages: boolean
    usesTools: boolean
}

export function assertModelCapabilities(
    capabilities: ModelCapabilities | undefined,
    requirements: ExecutionRequirements
): void {
    if (!capabilities) {
        throw new Error('Model capabilities are not available. Load them before running.')
    }

    if (!capabilities.chat) {
        throw new Error('This model does not support chat.')
    }

    if (requirements.hasImages && !capabilities.vision) {
        throw new Error('This model does not support images. Remove the images or choose another model.')
    }

    if (requirements.usesTools && !capabilities.toolCalling) {
        throw new Error('This model does not support tool calling. Choose another model.')
    }
}