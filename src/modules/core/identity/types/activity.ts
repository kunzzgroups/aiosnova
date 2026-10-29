export type ActivityModule = 'employees' | 'organization' | 'roles' | 'system'
export type ActivityAction = 'created' | 'updated' | 'deleted' | 'login'
export type ActivityResult = 'success' | 'failure'

export type ActivityEvent = {
  id: string
  companyId: string
  scopeKind: 'merchant' | 'company'
  actorId: string
  occurredAt: string
  actor: string
  email: string
  initials: string
  module: ActivityModule
  moduleKey: string
  action: ActivityAction
  actionKey: string
  target: string
  result: ActivityResult
  company: string
  resourceKey: string
  changes: { field: string; labelKey: string; before: string; after: string }[]
}
export type ActivitySummary = Omit<ActivityEvent, 'changes' | 'email'>
export type ActivityFilters = { query: string; actor: string; module: string; action: string; result: string; from: string; to: string }
export type ActivityQuery = ActivityFilters & { companyId: string; page: number; pageSize: number }
export type ActivityPageResult = { items: ActivitySummary[]; total: number; page: number; pageSize: number; source: 'mock' | 'backend' }
export type ActivityFilterOptions = { companies: { value: string; label: string }[]; actors: { value: string; label: string }[]; modules: ActivityModule[]; actions: ActivityAction[]; results: ActivityResult[] }
