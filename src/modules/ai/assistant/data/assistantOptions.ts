/**
 * Composer options for the AI Assistant.
 *
 * Both lists are seams, not content: they describe what the service will offer,
 * and the page renders them as-is (no invented entries).
 */

import type { SourceType } from '../types/assistant'

/**
 * Model picker seam.
 *
 * Empty on purpose - the composer renders a model button, but there is no
 * catalogue behind it yet. Wiring it up = own this list, pass it to the button,
 * call the service; whatever the service reports becomes the answer's model
 * label (`AssistantAnswer.model`).
 */
export type AssistantModelOption = { id: string; label: string }

export const assistantModels: AssistantModelOption[] = []

/** Which part of the active company's indexed sources a question may search. */
export type ScopeId = 'all' | SourceType

export const assistantScopes: ScopeId[] = ['all', 'contract', 'invoice', 'policy', 'record']
