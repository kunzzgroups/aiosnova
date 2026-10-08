/**
 * Assistant preferences, stored in localStorage.
 *
 * Right now the only setting is what happens when the user clicks "Open
 * source" on an Evidence card. Kept separate from the composer state so it
 * survives a reload and can be surfaced in a small settings drawer.
 */

const KEY = 'aios.ai.assistant.prefs'

export type EvidenceAction = 'navigate' | 'newTab'

export type AssistantPreferences = {
  /** What to do when the user clicks "Open source". */
  evidenceAction: EvidenceAction
}

const DEFAULTS: AssistantPreferences = {
  evidenceAction: 'navigate',
}

export function readAssistantPrefs(): AssistantPreferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<AssistantPreferences>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export function writeAssistantPrefs(prefs: AssistantPreferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable */
  }
}