import { apiRequest, ApiError } from '@/services/httpClient'
import { useCompanyStore } from '@/stores/companyStore'

export type KnowledgePermissions = { canRead: boolean; canWrite: boolean; canPromote: boolean; canUseTemplates: boolean; canOverseeTemplates: boolean }
const permissions = new Map<string, KnowledgePermissions>()
const versions = new Map<string, number>()
const key = (company: string, entity: string, id: string) => company + ':' + entity + ':' + id
export const knowledgeCompany = () => useCompanyStore.getState().companyId
export function rememberVersion(company: string, entity: string, value: { id: string; version?: number }) {
  if (value.version !== undefined) versions.set(key(company, entity, value.id), value.version)
}
export const knownVersion = (company: string, entity: string, id: string) => versions.get(key(company, entity, id))
export const knownPermissions = (company: string) => permissions.get(company)
export function rememberPermissions(company: string, value?: KnowledgePermissions) { if (value) permissions.set(company, value) }
export const knowledgeQuery = (company: string, version?: number) => '?companyId=' + encodeURIComponent(company) + (version === undefined ? '' : '&version=' + version)
export function knowledgeRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return apiRequest<T>('/api/ai/knowledge' + path, { ...options, auth: true, cache: 'no-store' })
}
export async function fetchKnowledgePermissions(company: string) {
  const value = await knowledgeRequest<KnowledgePermissions>('/permissions' + knowledgeQuery(company))
  rememberPermissions(company, value); return value
}
export const userCanWriteKnowledge = (company: string) => knownPermissions(company)?.canWrite ?? false
export function assertActiveCompany(company: string) { if (company !== knowledgeCompany()) throw new ApiError('The company changed. Reopen the form.', 409) }
