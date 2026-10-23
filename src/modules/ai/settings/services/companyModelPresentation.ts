import type { AiModel } from '../types/settings'
import { getModelVendor } from './modelVendor'
export type CompanyModelAction = 'enable' | 'disable' | 'delete'
export function filterCompanyModels(models: AiModel[], filters: { query: string; providerId: string; vendor: string; status: string }): AiModel[] {
  const needle = filters.query.trim().toLowerCase()
  return models.filter(model =>
    (filters.providerId === 'all' || model.providerId === filters.providerId) &&
    (filters.vendor === 'all' || getModelVendor(model.modelId) === filters.vendor) &&
    (filters.status === 'all' || model.status === filters.status) &&
    (!needle || `${model.name} ${model.modelId}`.toLowerCase().includes(needle))
  ).sort((a, b) => a.name.localeCompare(b.name) || a.providerId.localeCompare(b.providerId))
}
export function companyModelActionTargets(models: AiModel[], action: CompanyModelAction): AiModel[] {
  return models.filter(model => action === 'enable'
    ? model.status !== 'enabled' && !!model.capabilities && !!model.capabilitiesCheckedAt && !model.capabilityError
    : action === 'disable' ? model.status === 'enabled' : model.status === 'disabled')
}
