import { i18n } from '@/i18n'
import { apiRequest, ApiError } from '@/services/httpClient'
import { fetchCompanies } from './identityService'
import type { OrganizationNode, PositionRecord } from '../types/identity'

export type DatabaseDepartment = Omit<OrganizationNode, 'code'> & { version: number }
export type DatabasePosition = Omit<PositionRecord, 'code' | 'description'> & { version: number; employeeCount: number; assignmentCount: number }
type DepartmentInput = { name: string; status?: OrganizationNode['status']; parentId?: string | null; managerPositionId?: string | null }
type PositionInput = { name: string; organizationId: string | null; level: NonNullable<PositionRecord['level']>; managedDepartmentIds?: string[]; managedDepartmentVersions?: Record<string,number> }

async function request<T>(path: string, options: Parameters<typeof apiRequest<T>>[1] = {}) {
  try {
    return await apiRequest<T>(path, { ...options, auth: true, cache: 'no-store' })
  } catch (error) {
    if (error instanceof ApiError && error.message.startsWith('org.')) throw new ApiError(String(i18n.t(error.message)), error.status, error.retryAfter)
    throw error
  }
}

export async function fetchOrganizationAccess(companyId: string,signal?:AbortSignal) {
  const result = await request<{ items: { id: string; code: string; name: string; canRead: boolean; canManage: boolean }[] }>('/api/identity/organization-companies',{signal})
  let company = result.items.find(item => item.id === companyId)
  if (!company) {
    // The existing company switcher still uses mock catalog IDs; match through its stable company code.
    const directory = await fetchCompanies(signal)
    const code = directory.items.find(item => item.id === companyId)?.code
    company = result.items.find(item => item.code === code)
  }
  if (!company) throw new ApiError(String(i18n.t('org.accessDenied')), 403)
  return company
}

export async function fetchOrganizationStructure(companyId: string,signal?:AbortSignal) {
  const company = await fetchOrganizationAccess(companyId,signal)
  if (!company.canRead) throw new ApiError(String(i18n.t('org.permissionDenied')), 403)
  const query = '?companyId=' + encodeURIComponent(company.id)
  const [departments, positions] = await Promise.all([
    request<{ items: DatabaseDepartment[]; canRead: boolean; canManage: boolean }>('/api/identity/organizations' + query,{signal}),
    request<{ items: DatabasePosition[] }>('/api/identity/positions' + query + '&date=' + new Date().toLocaleDateString('en-CA'),{signal}),
  ])
  return { companyId: company.id, departments: departments.items, positions: positions.items, canRead: departments.canRead, canManage: departments.canManage }
}

export async function fetchInvitationOrganization(companyId:string,signal?:AbortSignal) {
  const company=await fetchOrganizationAccess(companyId,signal)
  return request<{ companyId:string; departments:{ id:string; name:string; parentId:string|null; positions:{id:string;name:string}[] }[] }>('/api/identity/invitation-organization?companyId='+encodeURIComponent(company.id),{signal})
}

export function updateOrganization(item: DatabaseDepartment, payload: Partial<DepartmentInput>) {
  return request<DatabaseDepartment>('/api/identity/organizations/' + item.id, { method: 'PATCH', body: { ...payload, version: item.version } })
}

export function updatePosition(item: DatabasePosition, payload: Partial<PositionInput> & { status?: PositionRecord['status'] }) {
  return request<DatabasePosition>('/api/identity/positions/' + item.id, { method: 'PATCH', body: { ...payload, version: item.version } })
}

export function createOrganizationBatch(companyId: string, payload: { departments?: DepartmentInput[]; positions?: PositionInput[] }, requestId: string) {
  return request<{ departments: DatabaseDepartment[]; positions: DatabasePosition[]; departmentIds: string[]; positionIds: string[] }>('/api/identity/organization-batches', { method: 'POST', body: { companyId, ...payload, requestId } })
}

export type DepartmentRemovalImpact = { employeeCount:number; groups:{key:string;departmentId:string;departmentName:string;positionId:string|null;positionName:string|null;employeeCount:number}[];snapshot:string;canReassign:boolean }

export function fetchDepartmentRemovalImpact(item:DatabaseDepartment,signal?:AbortSignal) {
  return request<DepartmentRemovalImpact>('/api/identity/organizations/'+item.id+'/removal-impact',{signal})
}

export function removeDepartmentWithEmployees(item:DatabaseDepartment,payload:{mode:'retain'|'reassign';departmentId:string;positionMappings:{sourceKey:string;positionId:string}[];snapshot:string}) {
  return request<void>('/api/identity/organizations/'+item.id+'/remove',{method:'POST',body:{...payload,version:item.version}})
}

export function deleteOrganization(item: DatabaseDepartment) {
  return request<void>('/api/identity/organizations/' + item.id + '?version=' + item.version, { method: 'DELETE' })
}

export function deletePosition(item: DatabasePosition) {
  return request<void>('/api/identity/positions/' + item.id + '?version=' + item.version, { method: 'DELETE' })
}

export function deletePositions(companyId: string, positions: DatabasePosition[]) {
  return request<void>('/api/identity/positions/bulk-delete', { method: 'POST', body: { companyId, items: positions.map(item => ({ id: item.id, version: item.version })) } })
}
