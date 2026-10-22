export const MODEL_PROVIDER_SELECTION_EVENT = 'ai-model-provider-selection'
const fallback = new Map<string, string>()
const storageKey = (companyId: string) => `ai.models.provider:${companyId}`

export function readModelProvider(companyId: string): string {
  try {
    return window.sessionStorage.getItem(storageKey(companyId)) ?? fallback.get(companyId) ?? ''
  } catch {
    return fallback.get(companyId) ?? ''
  }
}

export function rememberModelProvider(companyId: string, providerId: string): void {
  if (!companyId || !providerId || readModelProvider(companyId) === providerId) return
  fallback.set(companyId, providerId)
  try {
    window.sessionStorage.setItem(storageKey(companyId), providerId)
  } catch { /* Keep navigation working when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(MODEL_PROVIDER_SELECTION_EVENT))
}

export function chooseModelProvider(companyId: string, availableIds: string[], routeId = ''): string {
  if (availableIds.includes(routeId)) return routeId
  const remembered = readModelProvider(companyId)
  return availableIds.includes(remembered) ? remembered : availableIds[0] ?? ''
}
