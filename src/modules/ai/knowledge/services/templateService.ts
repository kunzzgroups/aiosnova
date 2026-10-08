import { apiRequest, ApiError } from '@/services/httpClient'
import {
  adoptTemplate as adoptTemplateMock,
  deleteTemplate as deleteTemplateMock,
  getMockState,
  listTemplatesForCompany,
  listTemplatesForUser,
  promoteBaseToTemplate as promoteMock,
  updateTemplate as updateTemplateMock,
  TemplateError,
} from '@/modules/ai/mock/mockStore'
import {
  MOCK_USER,
  canPromote,
  canWriteToCompany,
  canEditTemplate,
  canDeleteTemplate
} from '@/modules/ai/mock/permissions'
import type { SeedTemplate } from '@/modules/ai/mock/templates'

const USE_MOCK = true

export type TemplateListItem = SeedTemplate & { itemCount: number }

function withCount(tpl: SeedTemplate): TemplateListItem {
  const itemCount =
    (tpl.documents?.length ?? 0) +
    (tpl.skills?.length ?? 0) +
    (tpl.dataSources?.length ?? 0)
  return { ...tpl, itemCount }
}

/**
 * Templates visible to a specific company. The company must be in the
 * template's `allowedCompanyIds`.
 */
export async function fetchTemplates(
  companyId: string,
): Promise<{ items: TemplateListItem[] }> {
  if (USE_MOCK) {
    return { items: listTemplatesForCompany(MOCK_USER, companyId).map(withCount) }
  }
  return apiRequest<{ items: TemplateListItem[] }>(
    `/api/knowledge/templates?companyId=${encodeURIComponent(companyId)}`,
    { auth: true },
  )
}

export async function fetchAllVisibleTemplates(): Promise<{ items: TemplateListItem[] }> {
  if (USE_MOCK) {
    return { items: listTemplatesForUser(MOCK_USER).map(withCount) }
  }
  return apiRequest<{ items: TemplateListItem[] }>(
    '/api/knowledge/templates',
    { auth: true },
  )
}

export type AdoptTemplatePayload = {
  templateId: string
  companyId: string
  baseName?: string
  category?: string
}

export type AdoptTemplateResponse = {
  baseId: string
  baseName: string
  documentsCreated: number
  skillsCreated: number
  dataSourcesCreated: number
}

export async function adoptKnowledgeTemplate(
  payload: AdoptTemplatePayload,
): Promise<AdoptTemplateResponse> {
  if (USE_MOCK) {
    try {
      return adoptTemplateMock(MOCK_USER, payload)
    } catch (error) {
      if (error instanceof TemplateError) {
        throw new ApiError(error.message, 400)
      }
      throw error
    }
  }
  return apiRequest<AdoptTemplateResponse>('/api/knowledge/templates/adopt', {
    method: 'POST',
    auth: true,
    body: payload,
  })
}

export type PromoteTemplatePayload = {
  baseId: string
  name?: string
  description?: string
  category?: string
  allowedCompanyIds?: string[]
}

export type PromoteTemplateResponse = {
  templateId: string
  templateName: string
  documentsCaptured: number
  skillsCaptured: number
  dataSourcesCaptured: number
}

export async function promoteKnowledgeBaseToTemplate(
  payload: PromoteTemplatePayload,
): Promise<PromoteTemplateResponse> {
  if (USE_MOCK) {
    try {
      return promoteMock(MOCK_USER, payload)
    } catch (error) {
      if (error instanceof TemplateError) {
        throw new ApiError(error.message, 400)
      }
      throw error
    }
  }
  return apiRequest<PromoteTemplateResponse>(
    '/api/knowledge/templates/promote',
    { method: 'POST', auth: true, body: payload },
  )
}

/* ------------------------------------------------------------------ */
/* UI helpers                                                          */
/* ------------------------------------------------------------------ */

/**
 * Should the "Use template" button be visible for `companyId`?
 *   - at least one template is shared with this company, AND
 *   - the user has editor/admin in this company.
 */
export function userCanSeeTemplates(companyId: string): boolean {
  if (!canWriteToCompany(MOCK_USER, companyId)) return false
  return listTemplatesForCompany(MOCK_USER, companyId).length > 0
}

/** Can the user promote this base? Admin of the base's owner company only. */
export function userCanPromoteBase(baseId: string): boolean {
  const base = getMockState().bases.find((b) => b.id === baseId)
  return base ? canPromote(MOCK_USER, base) : false
}

export type UpdateTemplatePayload = {
  templateId: string
  name?: string
  description?: string
  category?: string
  allowedCompanyIds?: string[]
}

export async function updateKnowledgeTemplate(
  payload: UpdateTemplatePayload,
): Promise<TemplateListItem> {
  if (USE_MOCK) {
    try {
      const result = updateTemplateMock(MOCK_USER, payload)
      return withCount(result)
    } catch (error) {
      if (error instanceof TemplateError) {
        throw new ApiError(error.message, 400)
      }
      throw error
    }
  }
  return apiRequest<TemplateListItem>(
    `/api/knowledge/templates/${encodeURIComponent(payload.templateId)}`,
    { method: 'PATCH', auth: true, body: payload },
  )
}

export async function deleteKnowledgeTemplate(templateId: string): Promise<void> {
  if (USE_MOCK) {
    try {
      deleteTemplateMock(MOCK_USER, templateId)
      return
    } catch (error) {
      if (error instanceof TemplateError) {
        throw new ApiError(error.message, 400)
      }
      throw error
    }
  }
  await apiRequest<void>(
    `/api/knowledge/templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE', auth: true },
  )
}

/**
 * Should the current user, acting as `activeCompanyId`, be able to edit or
 * delete this template?
 *
 * The active company must be the template's owner AND the user must be an
 * admin of that owner. An admin of company A browsing from company B does
 * not get the ⋯ menu on A-owned templates.
 */
export function userCanEditTemplate(
  templateId: string,
  activeCompanyId: string,
): boolean {
  const template = getMockState().templates.find((t) => t.id === templateId)
  return template
    ? canEditTemplate(MOCK_USER, template, activeCompanyId)
    : false
}

/**
 * Should the current user, acting as `activeCompanyId`, be able to delete
 * this template? admin of the owner company only.
 */
export function userCanDeleteTemplate(
  templateId: string,
  activeCompanyId: string,
): boolean {
  const template = getMockState().templates.find((t) => t.id === templateId)
  return template
    ? canDeleteTemplate(MOCK_USER, template, activeCompanyId)
    : false
}

/** Templates the ACTIVE company can see. */
export async function fetchTemplatesForCompany(
  companyId: string,
): Promise<{ items: TemplateListItem[] }> {
  if (USE_MOCK) {
    return { items: listTemplatesForCompany(MOCK_USER, companyId).map(withCount) }
  }
  return apiRequest<{ items: TemplateListItem[] }>(
    `/api/knowledge/templates?companyId=${encodeURIComponent(companyId)}`,
    { auth: true },
  )
}
