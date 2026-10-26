import type { KnowledgeBaseKind } from '../types/knowledge'
import { assertActiveCompany, knowledgeCompany, knowledgeQuery, knowledgeRequest, knownPermissions, knownVersion, rememberPermissions, rememberVersion, type KnowledgePermissions } from './knowledgeApi'
export type TemplateListItem = {
  id: string; name: string; description: string; category: string; kind: KnowledgeBaseKind
  ownerCompanyId: string; allowedCompanyIds: string[]; itemCount: number; version?: number; canEdit?: boolean; canDelete?: boolean
  documents?: { title: string; type: 'policy' | 'contract' | 'invoice' | 'record' }[]
  skills?: { name: string; description: string; inputSchema?: Record<string, unknown> }[]
  dataSources?: { name: string; kind: 'table' | 'api' | 'database'; config: Record<string, string> }[]
}
export type AdoptTemplatePayload = { templateId: string; companyId: string; baseName?: string; category?: string }
export type AdoptTemplateResponse = { baseId: string; baseName: string; documentsCreated: number; skillsCreated: number; dataSourcesCreated: number }
export type PromoteTemplatePayload = { baseId: string; name?: string; description?: string; category?: string; allowedCompanyIds?: string[]; version?: number }
export type PromoteTemplateResponse = { templateId: string; templateName: string; documentsCaptured: number; skillsCaptured: number; dataSourcesCaptured: number }
export type UpdateTemplatePayload = { templateId: string; name?: string; description?: string; category?: string; allowedCompanyIds?: string[]; version?: number }
const permissionsByTemplate = new Map<string, { edit: boolean; delete: boolean }>()
async function list(company: string, library: boolean) {
  const result = await knowledgeRequest<{ items: TemplateListItem[]; permissions: KnowledgePermissions }>('/templates' + knowledgeQuery(company) + '&library=' + library)
  rememberPermissions(company, result.permissions)
  result.items.forEach(template => { rememberVersion(company, 'templates', template); permissionsByTemplate.set(company + ':' + template.id, { edit: template.canEdit ?? false, delete: template.canDelete ?? false }) })
  return result
}
export const fetchTemplates = (company: string) => list(company, false)
export const fetchTemplatesForCompany = (company: string) => list(company, true)
export const fetchAllVisibleTemplates = () => list(knowledgeCompany(), true)
export function userCanSeeTemplates(company: string) { return knownPermissions(company)?.canUseTemplates ?? false }
export function userCanPromoteBase(_baseId: string) { return knownPermissions(knowledgeCompany())?.canPromote ?? false }
export function userCanEditTemplate(id: string, company: string) { return permissionsByTemplate.get(company + ':' + id)?.edit ?? false }
export function userCanDeleteTemplate(id: string, company: string) { return permissionsByTemplate.get(company + ':' + id)?.delete ?? false }
export async function adoptKnowledgeTemplate(payload: AdoptTemplatePayload): Promise<AdoptTemplateResponse> {
  assertActiveCompany(payload.companyId)
  return knowledgeRequest('/templates/adopt', { method: 'POST', body: payload })
}
export async function promoteKnowledgeBaseToTemplate(payload: PromoteTemplatePayload): Promise<PromoteTemplateResponse> {
  const companyId = knowledgeCompany()
  return knowledgeRequest('/templates/promote', { method: 'POST', body: { ...payload, companyId, version: payload.version ?? knownVersion(companyId, 'bases', payload.baseId) } })
}
export async function updateKnowledgeTemplate(payload: UpdateTemplatePayload): Promise<TemplateListItem> {
  const companyId = knowledgeCompany()
  return knowledgeRequest('/templates/' + encodeURIComponent(payload.templateId), { method: 'PATCH', body: { ...payload, companyId, version: payload.version ?? knownVersion(companyId, 'templates', payload.templateId) } })
}
export async function deleteKnowledgeTemplate(id: string, version?: number): Promise<void> {
  const company = knowledgeCompany()
  await knowledgeRequest('/templates/' + encodeURIComponent(id) + knowledgeQuery(company, version ?? knownVersion(company, 'templates', id)), { method: 'DELETE' })
}
