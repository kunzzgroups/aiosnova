/**
 * In-memory mock state.
 *
 * Every read or write that must respect permissions takes the acting user as
 * the first argument. Nothing bypasses `permissions.ts` by accident.
 */

import { DEMO_MERCHANT_ID } from '@/mocks/data/identity'
import type { AgentListItem } from '@/modules/ai/agents/types/agent'
import {
  SEED_AGENTS,
  SEED_KNOWLEDGE_BASES,
  SEED_DOCUMENTS,
  SEED_SKILLS,
  SEED_DATA_SOURCES,
  type SeedAgent,
  type SeedKnowledgeBase,
  type SeedDocument,
} from './seed'
import type {
  KnowledgeDataSource,
  KnowledgeSkill,
} from '@/modules/ai/knowledge/types/knowledge'
import { SEED_TEMPLATES, type SeedTemplate } from './templates'
import {
  canRead,
  canReadAsCompany,
  canWrite,
  canPromote,
  canEditTemplate,
  canDeleteTemplate,
  type User,
} from './permissions'

type MockState = {
  agents: SeedAgent[]
  bases: SeedKnowledgeBase[]
  documents: SeedDocument[]
  skills: KnowledgeSkill[]
  dataSources: KnowledgeDataSource[]
  documentOverrides: Map<string, string[]>
  templates: SeedTemplate[]
}

function buildInitialState(): MockState {
  return {
    agents: SEED_AGENTS.map((a) => ({
      ...a,
      knowledgeBaseIds: [...a.knowledgeBaseIds],
      model: { ...a.model },
    })),
    bases: SEED_KNOWLEDGE_BASES.map((b) => ({
      ...b,
      allowedCompanyIds: [...b.allowedCompanyIds],
    })),
    documents: SEED_DOCUMENTS.map((d) => ({ ...d })),
    skills: SEED_SKILLS.map((s) => ({ ...s })),
    dataSources: SEED_DATA_SOURCES.map((d) => ({ ...d, config: { ...d.config } })),
    documentOverrides: new Map(),
    templates: SEED_TEMPLATES.map((t) => ({
      ...t,
      allowedCompanyIds: [...t.allowedCompanyIds],
    })),
  }
}

let state: MockState = buildInitialState()

export function resetMockStore(): void {
  state = buildInitialState()
}

export function getMockState(): MockState {
  return state
}

/* ------------------------------------------------------------------ */
/* ID                                                                  */
/* ------------------------------------------------------------------ */

let idCounter = 0
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

/* ------------------------------------------------------------------ */
/* Relation reads                                                      */
/* ------------------------------------------------------------------ */

export function agentIdsForBase(
  baseId: string,
  restrictToCompanyId?: string,
): string[] {
  return state.agents
    .filter((agent) => agent.knowledgeBaseIds.includes(baseId))
    .filter(
      (agent) => !restrictToCompanyId || agent.companyId === restrictToCompanyId,
    )
    .map((agent) => agent.id)
}

export function effectiveAgentIdsForDocument(documentId: string): {
  agentIds: string[]
  source: 'base' | 'document'
} {
  const override = state.documentOverrides.get(documentId)
  if (override !== undefined) return { agentIds: [...override], source: 'document' }
  const doc = state.documents.find((d) => d.id === documentId)
  if (!doc) return { agentIds: [], source: 'base' }
  return { agentIds: agentIdsForBase(doc.baseId), source: 'base' }
}

/* ------------------------------------------------------------------ */
/* Relation writes                                                     */
/* ------------------------------------------------------------------ */

export function setBaseAgents(baseId: string, agentIds: string[]): void {
  const set = new Set(agentIds)
  for (const agent of state.agents) {
    const has = agent.knowledgeBaseIds.includes(baseId)
    if (set.has(agent.id) && !has) {
      agent.knowledgeBaseIds = [...agent.knowledgeBaseIds, baseId]
    } else if (!set.has(agent.id) && has) {
      agent.knowledgeBaseIds = agent.knowledgeBaseIds.filter((id) => id !== baseId)
    }
  }
}

export function setDocumentOverride(documentId: string, agentIds: string[] | null): void {
  if (agentIds === null) state.documentOverrides.delete(documentId)
  else state.documentOverrides.set(documentId, [...agentIds])
}

/* ------------------------------------------------------------------ */
/* Row projections                                                     */
/* ------------------------------------------------------------------ */

export function toAgentListItem(agent: SeedAgent): AgentListItem {
  return {
    id: agent.id,
    merchantId: agent.merchantId,
    companyId: agent.companyId,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    status: agent.status,
    createdAt: agent.createdAt,
    model: { ...agent.model },
    knowledgeBaseCount: agent.knowledgeBaseIds.length,
    knowledgeBaseIds: [...agent.knowledgeBaseIds],
  }
}

export function toBaseListItem(base: SeedKnowledgeBase, restrictToCompanyId?: string,) {
  const agentIds = agentIdsForBase(base.id, restrictToCompanyId)
  const documents = state.documents.filter((d) => d.baseId === base.id)
  const skillCount = state.skills.filter((s) => s.baseId === base.id).length
  const dataSourceCount = state.dataSources.filter((d) => d.baseId === base.id).length

  let status: SeedKnowledgeBase['status'] = base.status
  if (base.kind === 'document') {
    if (documents.length === 0) status = 'empty'
    else if (documents.some((d) => d.status === 'failed')) status = 'failed'
    else if (documents.some((d) => d.status === 'processing')) status = 'processing'
    else status = 'ready'
  } else if (base.kind === 'skill') {
    status = skillCount === 0 ? 'empty' : 'ready'
  } else if (base.kind === 'data') {
    status = dataSourceCount === 0 ? 'empty' : 'ready'
  }

  return {
    id: base.id,
    merchantId: base.merchantId,
    companyId: base.companyId,
    allowedCompanyIds: [...base.allowedCompanyIds],
    name: base.name,
    description: base.description,
    category: base.category,
    kind: base.kind,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    status,
    documentCount: documents.length,
    agentCount: agentIds.length,
    agentIds,
  }
}

/* ================================================================== */
/* Permission-filtered views                                           */
/* ================================================================== */

/**
 * Bases visible while acting as `activeCompanyId`:
 *   - owned by the active company, OR
 *   - owned by another company and shared with the active company.
 *
 * This is what the Knowledge screen shows. A user who is a member of A and B
 * but is currently "in" A does NOT see B's private bases.
 */
export function listBasesVisibleFrom(
  user: User,
  activeCompanyId: string,
): SeedKnowledgeBase[] {
  return state.bases.filter((base) => {
    if (base.companyId === activeCompanyId) return true
    if (!canRead(user, base)) return false
    return canReadAsCompany(base, activeCompanyId)
  })
}

/** All bases the user may read, regardless of active company. */
export function listBasesForUser(user: User): SeedKnowledgeBase[] {
  return state.bases.filter((base) => canRead(user, base))
}

/** Templates visible to a specific company. */
export function listTemplatesForCompany(
  user: User,
  activeCompanyId: string,
): SeedTemplate[] {
  return state.templates
    .filter((tpl) => canRead(user, tpl) && tpl.allowedCompanyIds.includes(activeCompanyId))
    .map((tpl) => ({ ...tpl, allowedCompanyIds: [...tpl.allowedCompanyIds] }))
}

/** Every template the user can see from any of their companies. */
export function listTemplatesForUser(user: User): SeedTemplate[] {
  return state.templates
    .filter((tpl) => canRead(user, tpl))
    .map((tpl) => ({ ...tpl, allowedCompanyIds: [...tpl.allowedCompanyIds] }))
}

/* ================================================================== */
/* Template library                                                    */
/* ================================================================== */

export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateError'
  }
}

export type AdoptTemplateResult = {
  baseId: string
  baseName: string
  documentsCreated: number
  skillsCreated: number
  dataSourcesCreated: number
}

/**
 * Adopt a template into `companyId`. Snapshot: a fresh base is created, its
 * content is cloned, and no agent links travel with it.
 *
 * Enforced:
 *   - the template must be visible to `companyId`
 *   - the user must have editor/admin in `companyId`
 */
export function adoptTemplate(
  user: User,
  payload: {
    templateId: string
    companyId: string
    baseName?: string
    category?: string
  },
): AdoptTemplateResult {
  const template = state.templates.find((tpl) => tpl.id === payload.templateId)
  if (!template) {
    throw new TemplateError(`Template ${payload.templateId} not found`)
  }
  if (!canRead(user, template)) {
    throw new TemplateError('You do not have permission to view this template.')
  }
  if (!template.allowedCompanyIds.includes(payload.companyId)) {
    throw new TemplateError(
      'This template is not shared with the selected company.',
    )
  }
  if (!canWrite(user, { companyId: payload.companyId })) {
    throw new TemplateError(
      'You do not have permission to create a base in this company.',
    )
  }

  const now = new Date().toISOString()
  const baseId = nextId('kb')

  const base: SeedKnowledgeBase = {
    id: baseId,
    merchantId: DEMO_MERCHANT_ID,
    companyId: payload.companyId,
    // Adopted bases start owner-only; visibility can be widened later.
    allowedCompanyIds: [payload.companyId],
    name: payload.baseName?.trim() || template.name,
    description: template.description,
    category: payload.category?.trim() || template.category,
    kind: template.kind,
    createdAt: now,
    updatedAt: now,
    status: 'empty',
  }
  state.bases.push(base)

  let documentsCreated = 0
  let skillsCreated = 0
  let dataSourcesCreated = 0

  for (const doc of template.documents ?? []) {
    state.documents.push({
      id: nextId(`${baseId}-doc`),
      baseId,
      title: doc.title,
      kind: 'file',
      type: doc.type,
      status: 'ready',
      chunkCount: 12,
      sizeBytes: 0,
      uploadedAt: now,
      lastIndexedAt: now,
    })
    documentsCreated += 1
  }

  for (const skill of template.skills ?? []) {
    state.skills.push({
      id: nextId(`${baseId}-skill`),
      baseId,
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema,
      status: 'ready',
      updatedAt: now,
    })
    skillsCreated += 1
  }

  for (const ds of template.dataSources ?? []) {
    state.dataSources.push({
      id: nextId(`${baseId}-ds`),
      baseId,
      name: ds.name,
      kind: ds.kind,
      config: { ...ds.config },
      status: 'connected',
      lastSyncedAt: now,
    })
    dataSourcesCreated += 1
  }

  return {
    baseId,
    baseName: base.name,
    documentsCreated,
    skillsCreated,
    dataSourcesCreated,
  }
}

export type PromoteResult = {
  templateId: string
  templateName: string
  documentsCaptured: number
  skillsCaptured: number
  dataSourcesCaptured: number
}

/**
 * Promote a company base into the template library.
 *
 * Admin-only. The new template's default visibility is the owner company only.
 */
export function promoteBaseToTemplate(
  user: User,
  payload: {
    baseId: string
    name?: string
    description?: string
    category?: string
    allowedCompanyIds?: string[]
  },
): PromoteResult {
  const base = state.bases.find((b) => b.id === payload.baseId)
  if (!base) {
    throw new TemplateError(`Base ${payload.baseId} not found`)
  }
  if (!canPromote(user, base)) {
    throw new TemplateError(
      'Only an admin of this company can promote a base to the template library.',
    )
  }

  const template: SeedTemplate = {
    id: nextId('tpl'),
    name: payload.name?.trim() || base.name,
    description: payload.description?.trim() || base.description,
    category: payload.category?.trim() || base.category || 'Other',
    kind: base.kind ?? 'document',
    ownerCompanyId: base.companyId,
    allowedCompanyIds:
      payload.allowedCompanyIds && payload.allowedCompanyIds.length > 0
        ? [...payload.allowedCompanyIds]
        : [base.companyId],
  }

  const docs = state.documents.filter((d) => d.baseId === base.id)
  if (docs.length > 0) {
    template.documents = docs.map((d) => ({ title: d.title, type: d.type }))
  }

  const skills = state.skills.filter((s) => s.baseId === base.id)
  if (skills.length > 0) {
    template.skills = skills.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }))
  }

  const sources = state.dataSources.filter((d) => d.baseId === base.id)
  if (sources.length > 0) {
    template.dataSources = sources.map((d) => ({
      name: d.name,
      kind: d.kind,
      config: { ...d.config },
    }))
  }

  state.templates.push(template)

  return {
    templateId: template.id,
    templateName: template.name,
    documentsCaptured: docs.length,
    skillsCaptured: skills.length,
    dataSourcesCaptured: sources.length,
  }
}

/* ================================================================== */
/* Guarded write helpers                                               */
/* ================================================================== */

export function assertCanWriteBase(user: User, baseId: string): SeedKnowledgeBase {
  const base = state.bases.find((b) => b.id === baseId)
  if (!base) throw new TemplateError(`Base ${baseId} not found`)
  if (!canWrite(user, base)) {
    throw new TemplateError('You do not have permission to modify this base.')
  }
  return base
}

/* ================================================================== */
/* Template editing                                                    */
/* ================================================================== */

export type UpdateTemplatePayload = {
  templateId: string
  name?: string
  description?: string
  category?: string
  allowedCompanyIds?: string[]
}

/**
 * Edit an existing template. Only tenants' admins of at least one company
 * that can see the template may edit it.
 *
 * For the mock we simply require the user to be able to read the template
 * AND to have admin rights in at least one of the companies in its current
 * `allowedCompanyIds`.
 */
export function updateTemplate(
  user: User,
  payload: UpdateTemplatePayload,
): SeedTemplate {
  const template = state.templates.find((tpl) => tpl.id === payload.templateId)
  if (!template) {
    throw new TemplateError(`Template ${payload.templateId} not found`)
  }
  if (!canRead(user, template)) {
    throw new TemplateError('You do not have permission to view this template.')
  }
  if (!canEditTemplate(user, template)) {
    throw new TemplateError(
      'Only an admin of the owning company can edit this template.',
    )
  }

  if (payload.name !== undefined) {
    template.name = payload.name.trim() || template.name
  }
  if (payload.description !== undefined) {
    template.description = payload.description
  }
  if (payload.category !== undefined) {
    template.category = payload.category.trim() || template.category
  }
  if (payload.allowedCompanyIds !== undefined) {
    // De-dup and never allow an empty list (a template with nobody seeing
    // it is effectively deleted; use deleteTemplate for that).
    const next = [...new Set(payload.allowedCompanyIds)]
    if (next.length === 0) {
      throw new TemplateError('A template must be visible to at least one company.')
    }
    template.allowedCompanyIds = next
  }

  return { ...template, allowedCompanyIds: [...template.allowedCompanyIds] }
}

/**
 * Delete a template. Same admin rule as `updateTemplate`.
 */
export function deleteTemplate(user: User, templateId: string): void {
  const index = state.templates.findIndex((tpl) => tpl.id === templateId)
  if (index === -1) {
    throw new TemplateError(`Template ${templateId} not found`)
  }
  const template = state.templates[index]
  if (!canRead(user, template)) {
    throw new TemplateError('You do not have permission to view this template.')
  }
  // Delete is stricter than edit: admin of the owner only.
  if (!canDeleteTemplate(user, template)) {
    throw new TemplateError(
      'Only an admin of the owning company can delete this template.',
    )
  }
  state.templates.splice(index, 1)
}
