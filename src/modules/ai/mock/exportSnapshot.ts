import { getMockState } from './mockStore'

/** Local developer backup, not an authorized server import or a file-content backup. */
export function createMockSnapshot() {
  const state = getMockState()
  const data = structuredClone({
    agents: state.agents,
    bases: state.bases,
    documents: state.documents,
    skills: state.skills,
    dataSources: state.dataSources,
    templates: state.templates,
    // Keep entries with []: absent means inherit, [] means explicitly excluded.
    documentOverrides: Array.from(state.documentOverrides, ([documentId, agentIds]) => ({
      documentId,
      agentIds,
    })),
  })
  return {
    format: 'aiosnova-ai-mock-snapshot',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: 'all-mock-companies',
    counts: {
      agents: data.agents.length,
      bases: data.bases.length,
      documents: data.documents.length,
      skills: data.skills.length,
      dataSources: data.dataSources.length,
      templates: data.templates.length,
      documentOverrides: data.documentOverrides.length,
      emptyDocumentOverrides: data.documentOverrides.filter(item => item.agentIds.length === 0).length,
      baseBindings: data.agents.reduce((count, agent) => count + agent.knowledgeBaseIds.length, 0),
    },
    warnings: {
      metadataOnly: true,
      temporaryFileDocumentIds: data.documents.filter(doc => doc.fileUrl?.startsWith('blob:')).map(doc => doc.id),
    },
    data,
  }
}

export function downloadMockSnapshot() {
  if (!import.meta.env.DEV) throw new Error('Mock export is available in development only.')
  const snapshot = createMockSnapshot()
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aiosnova-ai-mock-all-companies-${snapshot.exportedAt.replace(/[:.]/g, '-')}.json`
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Allow the browser to start the download before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
