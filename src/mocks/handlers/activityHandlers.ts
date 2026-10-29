import { delay, http, HttpResponse } from 'msw'
import { useAuthStore } from '@/stores/authStore'
import { activityEvents } from '@/mocks/data/activity'
import { DEMO_MERCHANT_ID, identityCompanies, identityUsers } from '@/mocks/data/identity'
import { activity as enActivity } from '@/i18n/locales/en/activity'
import { activity as zhActivity } from '@/i18n/locales/zh-CN/activity'
import { zonedDate } from '@/components/ui/dateRange'
import type { ActivityFilterOptions, ActivityQuery } from '@/modules/core/identity/types/activity'

const headers = { 'Cache-Control': 'private, no-store' }
function error(message: string, status: number) { return HttpResponse.json({ message }, { status, headers }) }

// This authenticates mock requests only. It never reads or authorizes real audit data.
// Until an audit permission policy exists, preview access is restricted to owners.
function context(request: Request) {
  const session = useAuthStore.getState()
  if (!session.accessToken || !session.user || request.headers.get('Authorization') !== 'Bearer ' + session.accessToken) return error('Your session has expired. Sign in again.', 401)
  const mirror = identityUsers.find(user => user.id === session.user?.id)
  if ((mirror && mirror.status !== 'active') || !(mirror?.isOwner ?? session.user.isOwner)) return error('You do not have permission to view activity logs.', 403)
  const params = new URL(request.url).searchParams
  const requestedScope = params.get('scope') ?? 'company'
  if (!['company', 'merchant'].includes(requestedScope)) return error('Invalid scope.', 400)
  if (requestedScope === 'merchant') {
    if (params.has('companyId')) return error('Merchant scope must not include companyId.', 400)
    return { companyId: 'merchant' }
  }
  const companyId = params.get('companyId')
  if (!companyId) return error('companyId is required.', 400)
  if (!identityCompanies.some(company => company.id === companyId && company.status === 'active' && company.merchantId === DEMO_MERCHANT_ID)) return error('You do not have access to this company.', 403)
  return { companyId }
}

function inScope(event: typeof activityEvents[number], companyId: string) {
  return companyId === 'merchant'
    ? event.scopeKind === 'merchant' || identityCompanies.some(company => company.id === event.companyId && company.merchantId === DEMO_MERCHANT_ID)
    : event.scopeKind === 'company' && event.companyId === companyId
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function queryActivity(companyId: string, params: URLSearchParams) {
  const page = Number(params.get('page') ?? '1')
  const pageSize = Number(params.get('pageSize') ?? '10')
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) return error('Invalid pagination. page must be positive and pageSize must be between 1 and 200.', 400)
  const filters = Object.fromEntries(['query', 'actor', 'module', 'action', 'result', 'from', 'to'].map(key => [key, params.get(key) ?? ''])) as Omit<ActivityQuery, 'companyId' | 'page' | 'pageSize'>
  if (filters.query.length > 500 || (filters.from && !validDate(filters.from)) || (filters.to && !validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) return error('Invalid activity filters or date range.', 400)
  for (const [key, values] of [['module', ['employees', 'organization', 'roles', 'system']], ['action', ['created', 'updated', 'deleted', 'login']], ['result', ['success', 'failure']]] as const) {
    if (filters[key] && !values.some(value => value === filters[key])) return error('Invalid ' + key + ' filter.', 400)
  }
  const query = filters.query.trim().toLocaleLowerCase()
  const items = activityEvents.filter(event => {
    if (!inScope(event, companyId)) return false
    const date = zonedDate(new Date(event.occurredAt), 'Asia/Singapore')
    const actionLabel = event.actionKey.split('.').pop()?.replace(/([a-z])([A-Z])/g, '$1 $2') ?? ''
    return (!query || [event.actor, event.email, event.target, event.action, event.module, actionLabel, enActivity[event.actionKey], zhActivity[event.actionKey], enActivity[event.moduleKey], zhActivity[event.moduleKey]].join(' ').toLocaleLowerCase().includes(query))
      && (!filters.actor || event.actorId === filters.actor) && (!filters.module || event.module === filters.module)
      && (!filters.action || event.action === filters.action) && (!filters.result || event.result === filters.result)
      && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id))
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)))
  return HttpResponse.json({
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(({ changes: _changes, email: _email, ...summary }) => summary),
    total: items.length, page: currentPage, pageSize, source: 'mock',
  }, { headers })
}

export const activityHandlers = [
  http.get('/api/identity/activity/filters', async ({ request }) => {
    await delay(200)
    const scope = context(request)
    if (scope instanceof Response) return scope
    const events = activityEvents.filter(event => inScope(event, scope.companyId))
    const options: ActivityFilterOptions = {
      companies: identityCompanies.filter(company => company.merchantId === DEMO_MERCHANT_ID && company.status === 'active').map(company => ({ value: company.id, label: company.name })),
      actors: [...new Map(events.map(event => [event.actorId, { value: event.actorId, label: event.actor }])).values()],
      modules: [...new Set(events.map(event => event.module))], actions: [...new Set(events.map(event => event.action))], results: ['success', 'failure'],
    }
    return HttpResponse.json(options, { headers })
  }),
  http.get('/api/identity/activity', async ({ request }) => {
    await delay(250)
    const scope = context(request)
    return scope instanceof Response ? scope : queryActivity(scope.companyId, new URL(request.url).searchParams)
  }),
  http.get('/api/identity/activity/:id', async ({ request, params }) => {
    await delay(200)
    const scope = context(request)
    if (scope instanceof Response) return scope
    const item = activityEvents.find(event => inScope(event, scope.companyId) && event.id === params.id)
    return item ? HttpResponse.json(item, { headers }) : error('This activity record is no longer available.', 404)
  }),
]
