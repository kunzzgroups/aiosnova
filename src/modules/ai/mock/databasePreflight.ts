import type { createMockSnapshot } from './exportSnapshot'
import { validateMockSnapshot } from './validateSnapshot'

export type DatabasePreflightReport = {
  passed: boolean
  errors: string[]
  warnings: string[]
  checkedIds: number
  checkedModelBindings: number
}

export type FullSnapshotReport = { passed: boolean; errors: string[]; warnings: string[]; counts: Record<string, number> }

export async function validateFullSnapshot(value: unknown): Promise<FullSnapshotReport> {
  const response = await fetch('/api/ai/migration/preflight/snapshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(value),
  })
  if (!response.ok) throw new Error(`Full backup validation could not complete (HTTP ${response.status}).`)
  const report: FullSnapshotReport = await response.json()
  if (typeof report.passed !== 'boolean' || !Array.isArray(report.errors) || !Array.isArray(report.warnings)
      || !report.errors.every(item => typeof item === 'string') || !report.warnings.every(item => typeof item === 'string')
      || !report.counts || typeof report.counts !== 'object') throw new Error('Invalid full backup validation response.')
  return report
}

export function buildDatabasePreflightRequest(value: unknown) {
  if (validateMockSnapshot(value).errors.length) throw new Error('Resolve offline errors before checking the database.')
  const { data } = value as ReturnType<typeof createMockSnapshot>
  const bases = new Map(data.bases.map(base => [base.id, base]))
  return {
    agents: data.agents.map(agent => ({ id: agent.id, companyId: agent.companyId })),
    bases: data.bases.map(base => ({ id: base.id, companyId: base.companyId })),
    documents: data.documents.map(doc => ({ id: doc.id, companyId: bases.get(doc.baseId)!.companyId })),
    skills: data.skills.map(skill => ({ id: skill.id, companyId: bases.get(skill.baseId)!.companyId })),
    dataSources: data.dataSources.map(source => ({ id: source.id, companyId: bases.get(source.baseId)!.companyId })),
    templates: data.templates.map(template => ({ id: template.id, companyId: template.ownerCompanyId })),
    models: data.agents.flatMap(agent => agent.model?.binding ? [{
      agentId: agent.id, companyId: agent.companyId,
      providerId: agent.model.binding.providerId, modelConfigId: agent.model.binding.modelConfigId,
    }] : []),
  }
}

export async function checkSnapshotDatabase(value: unknown): Promise<DatabasePreflightReport> {
  const response = await fetch('/api/ai/migration/preflight', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildDatabasePreflightRequest(value)),
  })
  if (!response.ok) throw new Error(`Database preflight could not complete (HTTP ${response.status}). Check the backend and database connection.`)
  const report: DatabasePreflightReport = await response.json()
  if (typeof report.passed !== 'boolean' || !Array.isArray(report.errors) || !Array.isArray(report.warnings)
    || !report.errors.every(item => typeof item === 'string') || !report.warnings.every(item => typeof item === 'string')
    || typeof report.checkedIds !== 'number' || typeof report.checkedModelBindings !== 'number') {
    throw new Error('Invalid database preflight response.')
  }
  return report
}
