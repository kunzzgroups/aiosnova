type Row = Record<string, unknown>
export type SnapshotReport = {
  errors: string[]
  warnings: string[]
  counts: Record<string, number>
}
const object = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const id = (value: unknown, max = 128): value is string => typeof value === 'string' && new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value)

/** Pure offline inspection. Does not trust snapshot counts, mutate state or access APIs. */
export function validateMockSnapshot(value: unknown): SnapshotReport {
  const report: SnapshotReport = { errors: [], warnings: [], counts: {} }
  const error = (path: string, message: string) => report.errors.push(`${path}: ${message}`)
  if (!object(value) || value.format !== 'aiosnova-ai-mock-snapshot' || value.schemaVersion !== 1
      || value.scope !== 'all-mock-companies' || !object(value.data)) {
    error('snapshot', 'Unsupported format, schema version, scope or missing data object.')
    return report
  }
  const data = value.data
  const tables: Record<string, Row[]> = {}
  for (const key of ['agents', 'bases', 'documents', 'skills', 'dataSources', 'templates', 'documentOverrides']) {
    const rows = data[key]
    if (!Array.isArray(rows)) { error(key, 'Expected an array.'); tables[key] = []; continue }
    report.counts[key] = rows.length
    tables[key] = rows.filter((row, index): row is Row => {
      if (object(row)) return true
      error(`${key}[${index}]`, 'Expected an object.'); return false
    })
  }
  function indexRows(key: string) {
    const map = new Map<string, Row>()
    tables[key].forEach((row, n) => {
      const path = `${key}[${n}]`
      if (!id(row.id)) error(path, 'Invalid ID (expected 1–128 ASCII letters, digits, underscores or hyphens).')
      else if (map.has(row.id)) error(path, `Duplicate ID ${row.id}.`)
      else map.set(row.id, row)
      if (['agents', 'bases'].includes(key)) {
        if (!id(row.companyId, 64)) error(path, 'Invalid companyId.')
        if (!id(row.merchantId, 64)) error(path, 'Invalid merchantId.')
      }
    })
    return map
  }
  const agents = indexRows('agents')
  const bases = indexRows('bases')
  const documents = indexRows('documents')
  indexRows('skills'); indexRows('dataSources'); indexRows('templates')
  for (const template of tables.templates) {
    if (!id(template.ownerCompanyId, 64)) error(String(template.id), 'Invalid template ownerCompanyId.')
  }
  function strings(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) { error(path, 'Expected an ID array.'); return [] }
    const result: string[] = []
    const seen = new Set<string>()
    for (const item of value) {
      if (!id(item)) { error(path, 'Invalid linked ID.'); continue }
      if (seen.has(item)) error(path, `Duplicate linked ID ${item}.`)
      seen.add(item); result.push(item)
    }
    return result
  }
  for (const [baseId, base] of bases) {
    if (!['document', 'skill', 'data'].includes(String(base.kind))) error(baseId, 'Invalid knowledge base kind.')
    const visibility = base.allowedCompanyIds === undefined ? [] : strings(base.allowedCompanyIds, `${baseId}.allowedCompanyIds`)
    if (visibility.some(company => !id(company, 64))) error(baseId, 'Readable company ID exceeds 64 characters.')
    if (visibility.length && !visibility.includes(String(base.companyId))) {
      report.warnings.push(`${baseId}: Owner is absent from allowedCompanyIds; database owner access will be implicit.`)
    }
  }
  report.counts.baseBindings = 0
  for (const [agentId, agent] of agents) {
    if (!['active', 'draft', 'disabled'].includes(String(agent.status))) error(agentId, 'Invalid Agent status.')
    const links = strings(agent.knowledgeBaseIds, `${agentId}.knowledgeBaseIds`)
    report.counts.baseBindings += links.length
    if (agent.status !== 'active' && links.length) error(agentId, 'Inactive Agent has knowledge base bindings.')
    for (const baseId of links) {
      const base = bases.get(baseId)
      if (!base) error(agentId, `Knowledge base ${baseId} does not exist in the snapshot.`)
      else if (base.companyId !== agent.companyId || base.merchantId !== agent.merchantId) error(agentId, `Knowledge base ${baseId} belongs to a different company or merchant.`)
    }
    if (!object(agent.model)) { error(agentId, 'Missing model configuration.'); continue }
    const model = agent.model
    if (typeof model.temperature !== 'number' || !Number.isFinite(model.temperature) || model.temperature < 0 || model.temperature > 2
      || typeof model.topP !== 'number' || !Number.isFinite(model.topP) || model.topP <= 0 || model.topP > 1
      || typeof model.maxTokens !== 'number' || !Number.isInteger(model.maxTokens) || model.maxTokens <= 0) error(agentId, 'Invalid model parameters.')
    if (model.binding !== undefined) {
      if (!object(model.binding) || !id(model.binding.providerId, 36) || !id(model.binding.modelConfigId, 36)) error(agentId, 'Invalid model binding.')
    } else if (model.provider !== 'auto' || model.model !== '') {
      error(agentId, 'Legacy model selection needs an explicit configuration UUID binding.')
    }
  }
  for (const table of ['documents', 'skills', 'dataSources']) {
    for (const row of tables[table]) {
      if (!id(row.baseId) || !bases.has(row.baseId)) error(String(row.id), 'Parent knowledge base is missing.')
      if (table === 'documents' && typeof row.fileUrl === 'string' && row.fileUrl.startsWith('blob:')) {
        report.warnings.push(`${row.id}: Temporary blob URL; original file must be uploaded separately.`)
      }
    }
  }
  const overrides = new Set<string>()
  report.counts.emptyDocumentOverrides = 0
  report.counts.documentBindings = 0
  for (const row of tables.documentOverrides) {
    const documentId = row.documentId
    if (!id(documentId)) { error('documentOverrides', 'Invalid documentId.'); continue }
    if (overrides.has(documentId)) error(documentId, 'Duplicate document override entry.')
    overrides.add(documentId)
    const doc = documents.get(documentId)
    const base = doc && typeof doc.baseId === 'string' ? bases.get(doc.baseId) : undefined
    if (!doc || !base) error(documentId, 'Override document or its parent knowledge base is missing.')
    const links = strings(row.agentIds, `${documentId}.agentIds`)
    if (Array.isArray(row.agentIds) && row.agentIds.length === 0) report.counts.emptyDocumentOverrides++
    report.counts.documentBindings += links.length
    for (const agentId of links) {
      const agent = agents.get(agentId)
      if (!agent) error(documentId, `Override Agent ${agentId} does not exist.`)
      else if (agent.status !== 'active') error(documentId, `Override Agent ${agentId} is inactive.`)
      else if (base && (agent.companyId !== base.companyId || agent.merchantId !== base.merchantId)) error(documentId, `Override Agent ${agentId} belongs to a different company or merchant.`)
    }
  }
  report.counts.inheritedDocuments = [...documents.keys()].filter(key => !overrides.has(key)).length
  report.warnings.push('Offline check only: company membership, current database conflicts and model availability have not been verified.')
  report.warnings.push('Files, vector indexes, Skills and Data Sources are not imported by this check. No data has been written.')
  if (object(value.counts)) {
    for (const [key, count] of Object.entries(report.counts)) {
      if (key in value.counts && value.counts[key] !== count) report.warnings.push(`counts.${key}: Saved count differs from the inspected data.`)
    }
  }
  return report
}
