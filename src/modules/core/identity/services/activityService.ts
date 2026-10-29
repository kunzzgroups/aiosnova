import { apiRequest } from '@/services/httpClient'
import type { ActivityEvent, ActivityFilterOptions, ActivityPageResult, ActivityQuery } from '../types/activity'
// Internal UI scope key; never send it as a company ID.
function scopeParams(companyId: string) {
  return companyId === 'merchant' ? new URLSearchParams({ scope: 'merchant' }) : new URLSearchParams({ scope: 'company', companyId })
}

export function fetchActivityPage(query: ActivityQuery, signal?: AbortSignal) {
  const params = scopeParams(query.companyId)
  params.set('page', String(query.page)); params.set('pageSize', String(query.pageSize))
  for (const key of ['query', 'actor', 'module', 'action', 'result', 'from', 'to'] as const) {
    const value = query[key]
    if (value && value !== 'all') params.set(key, value)
  }
  return apiRequest<ActivityPageResult>('/api/identity/activity?' + params, { auth: true, cache: 'no-store', signal })
}
export function fetchActivityFilters(companyId: string, signal?: AbortSignal) {
  return apiRequest<ActivityFilterOptions>('/api/identity/activity/filters?' + scopeParams(companyId), { auth: true, cache: 'no-store', signal })
}
export function fetchActivityDetail(companyId: string, id: string, signal?: AbortSignal) {
  return apiRequest<ActivityEvent>('/api/identity/activity/' + encodeURIComponent(id) + '?' + scopeParams(companyId), { auth: true, cache: 'no-store', signal })
}
