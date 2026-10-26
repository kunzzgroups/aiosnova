import { useAuthStore } from '@/stores/authStore'
import { ApiError } from '@/services/httpClient'
import type { KnowledgeBaseDetail, KnowledgeBaseListItem, KnowledgeDocument, KnowledgeDocumentType, KnowledgeSkill, KnowledgeDataSource, KnowledgeManualMode } from '../types/knowledge'
import { assertActiveCompany, knowledgeCompany, knowledgeQuery, knowledgeRequest, knownVersion, rememberPermissions, rememberVersion, type KnowledgePermissions } from './knowledgeApi'
export { userCanWriteKnowledge } from './knowledgeApi'
const item = encodeURIComponent

export async function fetchKnowledgeBases(companyId: string): Promise<{ items: KnowledgeBaseListItem[] }> {
  const response = await knowledgeRequest<{ items: KnowledgeBaseListItem[]; permissions: KnowledgePermissions }>('/bases' + knowledgeQuery(companyId))
  rememberPermissions(companyId, response.permissions)
  response.items.forEach(base => rememberVersion(companyId, 'bases', base))
  return response
}
export async function fetchKnowledgeBase(baseId: string, companyId = knowledgeCompany()): Promise<KnowledgeBaseDetail> {
  const [detail, permissions] = await Promise.all([
    knowledgeRequest<KnowledgeBaseDetail>('/bases/' + item(baseId) + knowledgeQuery(companyId)),
    knowledgeRequest<KnowledgePermissions>('/permissions' + knowledgeQuery(companyId)),
  ])
  rememberPermissions(companyId, permissions); rememberVersion(companyId, 'bases', detail.base)
  detail.documents.forEach(value => rememberVersion(companyId, 'documents', value))
  detail.skills.forEach(value => rememberVersion(companyId, 'skills', value))
  detail.dataSources.forEach(value => rememberVersion(companyId, 'data-sources', value))
  return detail
}
export async function createKnowledgeBase(payload: { name: string; description: string; companyId: string; agentIds: string[]; kind?: 'document' | 'skill' | 'data'; category?: string }): Promise<KnowledgeBaseListItem> {
  assertActiveCompany(payload.companyId)
  return knowledgeRequest('/bases', { method: 'POST', body: payload })
}
export async function updateKnowledgeBase(baseId: string, payload: { name?: string; description?: string; category?: string; version?: number }): Promise<KnowledgeBaseListItem> {
  const companyId = knowledgeCompany()
  return knowledgeRequest('/bases/' + item(baseId), { method: 'PATCH', body: { ...payload, companyId, version: payload.version ?? knownVersion(companyId, 'bases', baseId) } })
}
export async function deleteKnowledgeBase(baseId: string, version?: number): Promise<void> {
  const company = knowledgeCompany()
  await knowledgeRequest('/bases/' + item(baseId) + knowledgeQuery(company, version ?? knownVersion(company, 'bases', baseId)), { method: 'DELETE' })
}
async function remove(entity: string, id: string): Promise<void> {
  const company = knowledgeCompany()
  await knowledgeRequest('/' + entity + '/' + item(id) + knowledgeQuery(company, knownVersion(company, entity, id)), { method: 'DELETE' })
}
export const deleteKnowledgeDocument = (id: string) => remove('documents', id)
export const deleteKnowledgeSkill = (id: string) => remove('skills', id)
export const deleteKnowledgeDataSource = (id: string) => remove('data-sources', id)
export async function addKnowledgeDocument(baseId: string, payload: { title: string; type: KnowledgeDocumentType; agentIds: string[] | null; file?: File }): Promise<KnowledgeDocument> {
  const companyId = knowledgeCompany(); const form = new FormData()
  form.append('companyId', companyId); form.append('title', payload.title); form.append('type', payload.type); form.append('agentIds', JSON.stringify(payload.agentIds))
  if (payload.file) form.append('file', payload.file)
  return upload<KnowledgeDocument>('/bases/' + item(baseId) + '/documents', form)
}
async function upload<T>(path: string, form: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const response = await fetch('/api/ai/knowledge' + path, { method: 'POST', credentials: 'include', headers: token ? { Authorization: 'Bearer ' + token } : undefined, body: form })
  if (!response.ok) {
    let message = 'Unable to save the content (HTTP ' + response.status + ').'
    try { const body = await response.json() as { message?: string }; message = body.message ?? message } catch { /* retain status */ }
    throw new ApiError(message, response.status)
  }
  return response.json() as Promise<T>
}
export async function addKnowledgeSkill(baseId: string, payload: { name: string; description: string; inputSchema?: Record<string, unknown>; agentIds: string[] | null; file?: File }): Promise<KnowledgeSkill> {
  return addContent<KnowledgeSkill>('skills', baseId, payload)
}
export async function addKnowledgeDataSource(baseId: string, payload: { name: string; kind: 'table' | 'api' | 'database'; config: Record<string, string>; agentIds: string[] | null; file?: File }): Promise<KnowledgeDataSource> {
  return addContent<KnowledgeDataSource>('data-sources', baseId, payload)
}
async function addContent<T>(entity: string, baseId: string, payload: { file?: File }): Promise<T> {
  const { file, ...metadata } = payload
  const path = '/bases/' + item(baseId) + '/' + entity
  const body = { ...metadata, companyId: knowledgeCompany() }
  if (!file) return knowledgeRequest(path, { method: 'POST', body })
  const form = new FormData()
  form.append('payload', JSON.stringify(body)); form.append('file', file)
  return upload<T>(path, form)
}
export async function setKnowledgeBaseAgents(baseId: string, agentIds: string[]): Promise<void> {
  const companyId = knowledgeCompany()
  await knowledgeRequest('/bases/' + item(baseId) + '/agents', { method: 'PUT', body: { companyId, agentIds, version: knownVersion(companyId, 'bases', baseId) } })
}
export async function setDocumentAgents(documentId: string, agentIds: string[] | null): Promise<void> {
  const companyId = knowledgeCompany()
  await knowledgeRequest('/documents/' + item(documentId) + '/agents', { method: 'PUT', body: { companyId, agentIds, version: knownVersion(companyId, 'documents', documentId) } })
}
async function mode<T>(entity: string, id: string, mode: KnowledgeManualMode): Promise<T> {
  const companyId = knowledgeCompany()
  return knowledgeRequest('/' + entity + '/' + item(id) + '/mode', { method: 'PATCH', body: { companyId, mode, version: knownVersion(companyId, entity, id) } })
}
export const updateKnowledgeDocumentMode = (id: string, value: KnowledgeManualMode) => mode<KnowledgeDocument>('documents', id, value)
export const updateKnowledgeSkillMode = (id: string, value: KnowledgeManualMode) => mode<KnowledgeSkill>('skills', id, value)
export const updateKnowledgeDataSourceMode = (id: string, value: KnowledgeManualMode) => mode<KnowledgeDataSource>('data-sources', id, value)
// Processing/connection health belongs to backend workers, not a simulated timer.
export async function updateKnowledgeDocumentStatus(_id: string, _status: 'processing' | 'ready' | 'failed'): Promise<KnowledgeDocument | null> { throw new ApiError('Indexing status is managed by the backend ingestion process.', 409) }
export async function updateKnowledgeSkillStatus(_id: string, _status: 'draft' | 'ready' | 'failed'): Promise<KnowledgeSkill | null> { throw new ApiError('Execution status is managed by the backend.', 409) }
export async function updateKnowledgeDataSourceStatus(_id: string, _status: 'connected' | 'disconnected' | 'error'): Promise<KnowledgeDataSource | null> { throw new ApiError('Connection health is managed by the backend connector.', 409) }
