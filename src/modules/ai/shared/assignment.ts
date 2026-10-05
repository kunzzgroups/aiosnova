/**
 * The agent <-> knowledge relation.
 *
 * Lives in `shared/` because BOTH screens own it: the Agent screen ticks which
 * knowledge bases an agent uses, the Knowledge screen ticks which agents a base -
 * or a single document - is applied to. They are two views of the same table, so
 * the two screens can never disagree about who uses what.
 *
 * Two levels, per the agreed model:
 *   - `AgentKnowledgeLink`  base-level default, applies to every document in it
 *   - `AgentDocumentLink`   document-level OVERRIDE, wins over the default
 *
 * An override is "any row exists for this document", NOT a merge. Clearing all
 * rows for a document is how you go back to inheriting.
 */

export type AgentKnowledgeLink = {
  agentId: string
  baseId: string
  assignedAt: string
}

export type AgentDocumentLink = {
  agentId: string
  documentId: string
  assignedAt: string
}

/** Which level decided a document's agents. Drives the "Inherited / Override" tag. */
export type AssignmentSource = 'base' | 'document'

export type EffectiveAgents = {
  agentIds: string[]
  source: AssignmentSource
}

export const EMPTY_EFFECTIVE: EffectiveAgents = { agentIds: [], source: 'base' }

/**
 * Agents a document is actually searchable by.
 *
 * Override wins outright - even an override that ends up empty is respected, so a
 * document can be deliberately kept away from every agent while its base is shared.
 */
export function resolveEffectiveAgents(
  documentId: string,
  baseId: string,
  baseLinks: AgentKnowledgeLink[],
  documentLinks: AgentDocumentLink[],
): EffectiveAgents {
  const overrides = documentLinks.filter((link) => link.documentId === documentId)
  if (overrides.length > 0) {
    return { agentIds: overrides.map((link) => link.agentId), source: 'document' }
  }
  return {
    agentIds: baseLinks.filter((link) => link.baseId === baseId).map((link) => link.agentId),
    source: 'base',
  }
}

/**
 * Distinct agents a whole base reaches - the union of its documents' effective
 * agents, which is what the list screen reports as "Used by N agents".
 *
 * A base with no documents yet falls back to its own default links, so an empty
 * base that has already been assigned does not report zero.
 */
export function resolveBaseAgentIds(
  baseId: string,
  documentIds: string[],
  baseLinks: AgentKnowledgeLink[],
  documentLinks: AgentDocumentLink[],
): string[] {
  if (documentIds.length === 0) {
    return [...new Set(baseLinks.filter((link) => link.baseId === baseId).map((link) => link.agentId))]
  }

  const reached = new Set<string>()
  for (const documentId of documentIds) {
    for (const agentId of resolveEffectiveAgents(documentId, baseId, baseLinks, documentLinks)
      .agentIds) {
      reached.add(agentId)
    }
  }
  return [...reached]
}
