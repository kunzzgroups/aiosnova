import { useTranslation } from 'react-i18next'
import type { AgentModelConfig } from '../types/agent'
import type { AssistantModelOption } from '../../settings/services/settingsService'

export type ModelCheck = {
  companyId: string
  state: 'loading' | 'ready' | 'error'
}

type Props = {
  companyId: string
  check: ModelCheck
  config?: AgentModelConfig
  options: AssistantModelOption[]
}

export function agentModelAvailability({ companyId, check, config, options }: Props) {
  if (check.companyId !== companyId || check.state === 'loading') return 'checking'
  if (check.state === 'error') return 'checkFailed'
  if (config?.binding) {
    return options.some(option => option.id === config.binding?.modelConfigId &&
      option.providerId === config.binding?.providerId) ? 'bound' : 'unavailable'
  }
  if (config && config.provider !== 'auto') return 'legacy'
  return options.length ? 'auto' : 'noModel'
}

export function AgentModelSummary(props: Props) {
  const { t } = useTranslation()
  const state = agentModelAvailability(props)
  const specific = !!props.config?.binding ||
    (!!props.config && props.config.provider !== 'auto')
  const selected = state === 'bound' ? props.options.find(option =>
    option.id === props.config?.binding?.modelConfigId &&
    option.providerId === props.config?.binding?.providerId) : undefined
  return <>
    <span className={specific ? 'console-chip' : 'console-chip console-chip--muted'}>
      {specific ? selected?.label ?? t('ai.agents.modelAvailability.boundLabel')
        : t('ai.agents.modelAuto', 'Auto')}
    </span>
    <div className="console-table__muted">
      {t(`ai.agents.modelAvailability.${state}`)}
    </div>
  </>
}
