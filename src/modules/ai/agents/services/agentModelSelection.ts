import type { AgentModelConfig } from '../types/agent'
import type { AssistantModelOption } from '../../settings/services/settingsService'

/** UUID binding is authoritative; legacy explicit strings must be reselected. */
export function resolveAgentModelOption(
  config: AgentModelConfig | undefined,
  options: AssistantModelOption[],
): AssistantModelOption | undefined {
  if (config?.binding) {
    const selected = options.find(option =>
      option.id === config.binding?.modelConfigId &&
      option.providerId === config.binding?.providerId
    )
    if (!selected) throw new Error('The Agent model is disabled, deleted, or outside this company. Reassign the model.')
    return selected
  }
  if (!config || config.provider === 'auto') return undefined
  throw new Error('This Agent uses a legacy model configuration. Reselect and save a database model in AI Agents.')
}
