import { DEMO_MERCHANT_ID } from '@/mocks/data/identity'
import { apiRequest } from '@/services/httpClient'
import { ApiError } from '@/services/httpClient'
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseListItem,
  KnowledgeDocument,
  KnowledgeDocumentType,
  KnowledgeDataSource,
  KnowledgeSkill,
  KnowledgeManualMode,
} from '../types/knowledge'
import {
  agentIdsForBase,
  effectiveAgentIdsForDocument,
  getMockState,
  listBasesVisibleFrom,
  nextId,
  setBaseAgents,
  setDocumentOverride,
  toBaseListItem,
} from '@/modules/ai/mock/mockStore'
import { MOCK_USER, canWriteToCompany } from '@/modules/ai/mock/permissions'
const USE_MOCK = true
/**
 * Bases visible while acting as `activeCompanyId`.
 *
 * The rule lives in `listBasesVisibleFrom` so the AI, the backend, and this
 * service all share it. A user who is a member of A and B but is currently
 * "in" A does not see B's private bases here.
 */
export async function fetchKnowledgeBases(
  companyId: string,
): Promise<{ items: KnowledgeBaseListItem[] }> {
  if (USE_MOCK) {
    return {
      items: listBasesVisibleFrom(MOCK_USER, companyId).map((base) =>
        toBaseListItem(base, companyId),
      ),
    }
  }
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<{ items: KnowledgeBaseListItem[] }>(
    `/api/knowledge-bases${query}`,
    { auth: true },
  )
}
export async function fetchKnowledgeBase(
  baseId: string,
): Promise<KnowledgeBaseDetail> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) {
      throw new Error(`Knowledge base ${baseId} not found`)
    }
    const documents: KnowledgeDocument[] = state.documents
      .filter((doc) => doc.baseId === baseId)
      .map((doc) => ({
        id: doc.id,
        baseId: doc.baseId,
        kind: doc.kind,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        mode: doc.mode,
        chunkCount: doc.chunkCount,
        sizeBytes: doc.sizeBytes,
        uploadedAt: doc.uploadedAt,
        lastIndexedAt: doc.lastIndexedAt,
        fileUrl: doc.fileUrl,
        mimeType: doc.mimeType,
      }))
    const skills = state.skills
      .filter((skill) => skill.baseId === baseId)
      .map((skill) => ({ ...skill }))
    const dataSources = state.dataSources
      .filter((ds) => ds.baseId === baseId)
      .map((ds) => ({ ...ds, config: { ...ds.config } }))
    const effective = documents.map((doc) => {
      const { agentIds, source } = effectiveAgentIdsForDocument(doc.id)
      return { documentId: doc.id, agentIds, source }
    })
    return {
      base: toBaseListItem(base),
      documents,
      skills,
      dataSources,
      effective,
      baseAgentIds: agentIdsForBase(baseId),
    }
  }
  return apiRequest<KnowledgeBaseDetail>(`/api/knowledge-bases/${baseId}`, {
    auth: true,
  })
}
/* ------------------------------------------------------------------ */
/* Guarded writes                                                      */
/* ------------------------------------------------------------------ */
export async function createKnowledgeBase(payload: {
  name: string
  description: string
  companyId: string
  agentIds: string[]
  kind?: 'document' | 'skill' | 'data'
  category?: string
}): Promise<KnowledgeBaseListItem> {
  if (USE_MOCK) {
    if (!canWriteToCompany(MOCK_USER, payload.companyId)) {
      throw new ApiError(
        'You do not have permission to create a base in this company.',
        403,
      )
    }
    const state = getMockState()
    const now = new Date().toISOString()
    const base = {
      id: nextId('kb'),
      merchantId: DEMO_MERCHANT_ID,
      companyId: payload.companyId,
      allowedCompanyIds: [payload.companyId],
      name: payload.name,
      description: payload.description,
      category: payload.category ?? 'Other',
      kind: payload.kind ?? 'document',
      createdAt: now,
      updatedAt: now,
      status: 'empty' as const,
    }
    state.bases.push(base)
    setBaseAgents(base.id, payload.agentIds)
    return toBaseListItem(base)
  }
  return apiRequest<KnowledgeBaseListItem>('/api/knowledge-bases', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}
export async function updateKnowledgeBase(
  baseId: string,
  payload: { name?: string; description?: string; category?: string },
): Promise<KnowledgeBaseListItem> {
  if (USE_MOCK) {
    const base = getMockState().bases.find((b) => b.id === baseId)
    if (!base) {
      throw new Error(`Knowledge base ${baseId} not found`)
    }
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to update this base.', 403)
    }
    if (payload.name !== undefined) base.name = payload.name
    if (payload.description !== undefined) base.description = payload.description
    if (payload.category !== undefined) base.category = payload.category
    base.updatedAt = new Date().toISOString()
    return toBaseListItem(base)
  }
  return apiRequest<KnowledgeBaseListItem>(`/api/knowledge-bases/${baseId}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}
export async function deleteKnowledgeBase(baseId: string): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) return
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to delete this base.', 403)
    }
    state.bases = state.bases.filter((b) => b.id !== baseId)
    state.documents = state.documents.filter((d) => d.baseId !== baseId)
    state.skills = state.skills.filter((s) => s.baseId !== baseId)
    state.dataSources = state.dataSources.filter((d) => d.baseId !== baseId)
    for (const agent of state.agents) {
      agent.knowledgeBaseIds = agent.knowledgeBaseIds.filter((id) => id !== baseId)
    }
    for (const key of [...state.documentOverrides.keys()]) {
      const stillExists = state.documents.some((d) => d.id === key)
      if (!stillExists) state.documentOverrides.delete(key)
    }
    return
  }
  await apiRequest<void>(`/api/knowledge-bases/${baseId}`, {
    method: 'DELETE',
    auth: true,
  })
}
function markBaseEmptyIfNoSources(baseId: string): void {
  const state = getMockState()
  const base = state.bases.find((item) => item.id === baseId)
  if (!base) return
  const hasSources =
    base.kind === 'document'
      ? state.documents.some((item) => item.baseId === baseId)
      : base.kind === 'skill'
        ? state.skills.some((item) => item.baseId === baseId)
        : state.dataSources.some((item) => item.baseId === baseId)
  base.updatedAt = new Date().toISOString()
  if (!hasSources) {
    base.status = 'empty'
  }
}
export async function deleteKnowledgeDocument(
  documentId: string,
): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const document = state.documents.find((item) => item.id === documentId)
    if (!document) {
      // Idempotent delete: if it is already gone, also ensure no stale
      // document-level Agent override survives.
      state.documentOverrides.delete(documentId)
      return
    }
    const base = state.bases.find((item) => item.id === document.baseId)
    if (base && !canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError(
        'You do not have permission to delete this document.',
        403,
      )
    }
    // Release mock object URLs when possible.
    if (document.fileUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(document.fileUrl)
    }
    // Source of truth removal. Assistant retrieval scans state.documents, so
    // the document immediately stops being eligible as evidence.
    state.documents = state.documents.filter(
      (item) => item.id !== documentId,
    )
    // A deleted document must never keep a per-document Agent assignment.
    state.documentOverrides.delete(documentId)
    if (base) {
      markBaseEmptyIfNoSources(base.id)
    }
    return
  }
  // Backend contract: the server should delete the document, its indexed
  // chunks/embeddings, and all document-level Agent assignments atomically.
  await apiRequest<void>(`/api/knowledge-documents/${documentId}`, {
    method: 'DELETE',
    auth: true,
  })
}
export async function addKnowledgeDocument(
  baseId: string,
  payload: {
    title: string
    type: KnowledgeDocumentType
    agentIds: string[] | null
    file?: File
  },
): Promise<KnowledgeDocument> {
  if (USE_MOCK) {
    const state = getMockState()
    const now = new Date().toISOString()
    // Synchronous and can't fail in the browser. Note: the URL is only valid
    // for the current JS session — a reload invalidates it. A real backend
    // returns a signed storage URL instead.
    const fileUrl = payload.file
      ? URL.createObjectURL(payload.file)
      : undefined
    const document: KnowledgeDocument = {
      id: nextId(`${baseId}-doc`),
      baseId,
      kind: payload.file ? 'file' : 'record',
      type: payload.type,
      title: payload.title,
      status: 'processing',
      chunkCount: 0,
      sizeBytes: payload.file?.size ?? 0,
      uploadedAt: now,
      lastIndexedAt: null,
      fileUrl,
      mimeType: payload.file?.type,
    }
    state.documents.push({ ...document })
    if (payload.agentIds !== null) {
      setDocumentOverride(document.id, payload.agentIds)
    }
    const base = state.bases.find((b) => b.id === baseId)
    if (base) {
      base.updatedAt = now
    }
    // Mock ingestion: flip to ready (or failed) after a moment.
    window.setTimeout(() => {
      const live = state.documents.find((d) => d.id === document.id)
      if (!live) return
      const failed = Math.random() < 0.05
      live.status = failed ? 'failed' : 'ready'
      live.lastIndexedAt = failed ? null : new Date().toISOString()
      if (!failed) live.chunkCount = 12
    }, 1500)
    return document
  }
  const form = new FormData()
  form.append('title', payload.title)
  form.append('type', payload.type)
  form.append('agentIds', JSON.stringify(payload.agentIds))
  if (payload.file) form.append('file', payload.file)
  const response = await fetch(`/api/knowledge-bases/${baseId}/documents`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = text
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string }
      message = parsed.message ?? parsed.error ?? text
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(message || `HTTP ${response.status}`, response.status)
  }
  return (await response.json()) as KnowledgeDocument
}
export async function deleteKnowledgeSkill(
  skillId: string,
): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const skill = state.skills.find((item) => item.id === skillId)
    if (!skill) return
    const base = state.bases.find((item) => item.id === skill.baseId)
    if (base && !canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError(
        'You do not have permission to delete this skill.',
        403,
      )
    }
    // Runtime source-of-truth removal. Any Agent/tool enumeration that reads
    // state.skills can no longer expose or execute this skill.
    state.skills = state.skills.filter((item) => item.id !== skillId)
    if (base) {
      markBaseEmptyIfNoSources(base.id)
    }
    return
  }
  // Backend must also remove any skill-runtime/tool assignment rows or caches.
  await apiRequest<void>(`/api/knowledge-skills/${skillId}`, {
    method: 'DELETE',
    auth: true,
  })
}
export async function deleteKnowledgeDataSource(
  dataSourceId: string,
): Promise<void> {
  if (USE_MOCK) {
    const state = getMockState()
    const dataSource = state.dataSources.find(
      (item) => item.id === dataSourceId,
    )
    if (!dataSource) return
    const base = state.bases.find(
      (item) => item.id === dataSource.baseId,
    )
    if (base && !canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError(
        'You do not have permission to delete this data source.',
        403,
      )
    }
    // Runtime source-of-truth removal. Any Agent/data-tool enumeration that
    // reads state.dataSources can no longer expose this connection.
    state.dataSources = state.dataSources.filter(
      (item) => item.id !== dataSourceId,
    )
    if (base) {
      markBaseEmptyIfNoSources(base.id)
    }
    return
  }
  // Backend must also remove credentials/references, sync state, schema cache,
  // and Agent/tool assignment rows tied specifically to this source.
  await apiRequest<void>(
    `/api/knowledge-data-sources/${dataSourceId}`,
    {
      method: 'DELETE',
      auth: true,
    },
  )
}
export async function addKnowledgeSkill(
  baseId: string,
  payload: {
    name: string
    description: string
    inputSchema?: Record<string, unknown>
    agentIds: string[] | null
  },
): Promise<KnowledgeSkill> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) throw new ApiError(`Base ${baseId} not found`, 404)
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to modify this base.', 403)
    }
    const now = new Date().toISOString()
    const skill: KnowledgeSkill = {
      id: nextId(`${baseId}-skill`),
      baseId,
      name: payload.name,
      description: payload.description,
      inputSchema: payload.inputSchema,
      // Skill is immediately ready; no draft step.
      status: 'ready',
      updatedAt: now,
    }
    state.skills.push({ ...skill })
    return skill
  }
  return apiRequest<KnowledgeSkill>(
    `/api/knowledge-bases/${baseId}/skills`,
    { method: 'POST', auth: true, body: payload },
  )
}
export async function addKnowledgeDataSource(
  baseId: string,
  payload: {
    name: string
    kind: 'table' | 'api' | 'database'
    config: Record<string, string>
    agentIds: string[] | null
  },
): Promise<KnowledgeDataSource> {
  if (USE_MOCK) {
    const state = getMockState()
    const base = state.bases.find((b) => b.id === baseId)
    if (!base) throw new ApiError(`Base ${baseId} not found`, 404)
    if (!canWriteToCompany(MOCK_USER, base.companyId)) {
      throw new ApiError('You do not have permission to modify this base.', 403)
    }
    const ds: KnowledgeDataSource = {
      id: nextId(`${baseId}-ds`),
      baseId,
      name: payload.name,
      kind: payload.kind,
      config: { ...payload.config },
      status: 'disconnected',
      lastSyncedAt: null,
    }
    state.dataSources.push({ ...ds, config: { ...ds.config } })
    // Auto-connect after a beat; occasionally errors.
    window.setTimeout(() => {
      const live = state.dataSources.find((d) => d.id === ds.id)
      if (!live) return
      const failed = Math.random() < 0.05
      live.status = failed ? 'error' : 'connected'
      live.lastSyncedAt = failed ? null : new Date().toISOString()
    }, 1500)
    return ds
  }
  return apiRequest<KnowledgeDataSource>(
    `/api/knowledge-bases/${baseId}/data-sources`,
    { method: 'POST', auth: true, body: payload },
  )
}
export async function setKnowledgeBaseAgents(
  baseId: string,
  agentIds: string[],
): Promise<void> {
  if (USE_MOCK) {
    setBaseAgents(baseId, agentIds)
    return
  }
  await apiRequest<void>(`/api/knowledge-bases/${baseId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}
export async function setDocumentAgents(
  documentId: string,
  agentIds: string[] | null,
): Promise<void> {
  if (USE_MOCK) {
    setDocumentOverride(documentId, agentIds)
    return
  }
  await apiRequest<void>(`/api/knowledge-documents/${documentId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}
export async function updateKnowledgeDocumentStatus(
  documentId: string,
  status: 'processing' | 'ready' | 'failed',
): Promise<KnowledgeDocument | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const doc = state.documents.find((d) => d.id === documentId)
    if (!doc) return null
    doc.status = status
    doc.lastIndexedAt = status === 'ready' ? new Date().toISOString() : null
    if (status === 'ready') doc.chunkCount = doc.chunkCount || 12
    return {
      id: doc.id, baseId: doc.baseId, kind: doc.kind, type: doc.type,
      title: doc.title, status: doc.status, mode: doc.mode, chunkCount: doc.chunkCount,
      sizeBytes: doc.sizeBytes, uploadedAt: doc.uploadedAt,
      lastIndexedAt: doc.lastIndexedAt, fileUrl: doc.fileUrl, mimeType: doc.mimeType,
    }
  }
  return apiRequest<KnowledgeDocument>(
    `/api/knowledge-documents/${documentId}/status`,
    { method: 'PATCH', auth: true, body: { status } },
  )
}
export async function updateKnowledgeSkillStatus(
  skillId: string,
  status: 'draft' | 'ready' | 'failed',
): Promise<KnowledgeSkill | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const skill = state.skills.find((s) => s.id === skillId)
    if (!skill) return null
    skill.status = status
    skill.updatedAt = new Date().toISOString()
    return { ...skill }
  }
  return apiRequest<KnowledgeSkill>(`/api/knowledge-skills/${skillId}/status`, {
    method: 'PATCH', auth: true, body: { status },
  })
}
export async function updateKnowledgeDataSourceStatus(
  dsId: string,
  status: 'connected' | 'disconnected' | 'error',
): Promise<KnowledgeDataSource | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const ds = state.dataSources.find((d) => d.id === dsId)
    if (!ds) return null
    ds.status = status
    if (status === 'connected') ds.lastSyncedAt = new Date().toISOString()
    return { ...ds, config: { ...ds.config } }
  }
  return apiRequest<KnowledgeDataSource>(
    `/api/knowledge-data-sources/${dsId}/status`,
    { method: 'PATCH', auth: true, body: { status } },
  )
}
/* ------------------------------------------------------------------ */
/* User-controlled operating mode                                     */
/* ------------------------------------------------------------------ */
export async function updateKnowledgeDocumentMode(
  documentId: string,
  mode: KnowledgeManualMode,
): Promise<KnowledgeDocument | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const doc = state.documents.find((item) => item.id === documentId)
    if (!doc) return null
    doc.mode = mode
    return { ...doc }
  }
  return apiRequest<KnowledgeDocument>(
    `/api/knowledge-documents/${documentId}/mode`,
    { method: 'PATCH', auth: true, body: { mode } },
  )
}
export async function updateKnowledgeSkillMode(
  skillId: string,
  mode: KnowledgeManualMode,
): Promise<KnowledgeSkill | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const skill = state.skills.find((item) => item.id === skillId)
    if (!skill) return null
    skill.mode = mode
    skill.updatedAt = new Date().toISOString()
    return { ...skill }
  }
  return apiRequest<KnowledgeSkill>(
    `/api/knowledge-skills/${skillId}/mode`,
    { method: 'PATCH', auth: true, body: { mode } },
  )
}
export async function updateKnowledgeDataSourceMode(
  dataSourceId: string,
  mode: KnowledgeManualMode,
): Promise<KnowledgeDataSource | null> {
  if (USE_MOCK) {
    const state = getMockState()
    const dataSource = state.dataSources.find(
      (item) => item.id === dataSourceId,
    )
    if (!dataSource) return null
    dataSource.mode = mode
    return { ...dataSource, config: { ...dataSource.config } }
  }
  return apiRequest<KnowledgeDataSource>(
    `/api/knowledge-data-sources/${dataSourceId}/mode`,
    { method: 'PATCH', auth: true, body: { mode } },
  )
}