import { apiRequest } from '@/services/httpClient'
import type {
  DocumentEffectiveAgents,
  KnowledgeBaseDetail,
  KnowledgeBaseListItem,
  KnowledgeDocument,
} from '@/modules/ai/knowledge/types/knowledge'

/** Bases of one company. `companyId` empty means "every base in the tenant". */
export async function fetchKnowledgeBases(companyId: string) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<{ items: KnowledgeBaseListItem[] }>(`/api/knowledge/bases${query}`, {
    auth: true,
  })
}

export async function fetchKnowledgeBase(baseId: string) {
  return apiRequest<KnowledgeBaseDetail>(`/api/knowledge/bases/${baseId}`, { auth: true })
}

/**
 * Adds a source to a base. `agentIds: null` means "inherit the base's agents" -
 * pass an array to give this one document its own agents (an override).
 */
export async function addKnowledgeDocument(
  baseId: string,
  payload: {
    title: string
    type: KnowledgeDocument['type']
    agentIds: string[] | null
  },
) {
  return apiRequest<KnowledgeDocument>(`/api/knowledge/bases/${baseId}/documents`, {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

/**
 * Bases are always company-scoped, so `companyId` is required - the screen passes
 * the active company rather than offering a picker (a base created elsewhere would
 * simply vanish from the list you created it on).
 */
export async function createKnowledgeBase(payload: {
  name: string
  description: string
  companyId: string
  agentIds: string[]
}) {
  return apiRequest<KnowledgeBaseListItem>('/api/knowledge/bases', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

/** Renaming keeps every document and agent assignment in place. */
export async function updateKnowledgeBase(
  baseId: string,
  payload: { name: string; description: string },
) {
  return apiRequest<KnowledgeBaseListItem>(`/api/knowledge/bases/${baseId}`, {
    method: 'PATCH',
    auth: true,
    body: payload,
  })
}

/** Removes the base, its documents, and the agent links that pointed at either. */
export async function deleteKnowledgeBase(baseId: string) {
  return apiRequest<void>(`/api/knowledge/bases/${baseId}`, {
    method: 'DELETE',
    auth: true,
  })
}

/**
 * Base-level default. Writes the SAME relation the Agent screen writes, so a base
 * ticked here shows up ticked on that agent's screen too.
 */
export async function setKnowledgeBaseAgents(baseId: string, agentIds: string[]) {
  return apiRequest<KnowledgeBaseListItem>(`/api/knowledge/bases/${baseId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}

/** `agentIds: null` clears the override so the document inherits its base again. */
export async function setDocumentAgents(documentId: string, agentIds: string[] | null) {
  return apiRequest<DocumentEffectiveAgents>(`/api/knowledge/documents/${documentId}/agents`, {
    method: 'PUT',
    auth: true,
    body: { agentIds },
  })
}
