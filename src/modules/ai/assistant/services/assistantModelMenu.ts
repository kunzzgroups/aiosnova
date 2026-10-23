export function assistantModelMenuIds(input: {
  all: string[]; recommended: string[]; value: string; query: string;
  vendor: string; vendors: Record<string, string>; labels: Record<string, string>; browseAll: boolean
}): string[] {
  const needle = input.query.trim().toLowerCase()
  const available = new Set(input.all)
  const compact = [...new Set([...(available.has(input.value) ? [input.value] : []), ...input.recommended])]
    .filter(id => available.has(id))
  return (input.browseAll || needle ? input.all : compact).filter(id =>
    (input.vendor === 'all' || input.vendors[id] === input.vendor) &&
    (!needle || (input.labels[id] ?? id).toLowerCase().includes(needle))
  )
}

export function availableDefaultModelId(defaultId: string | null, availableIds: string[]): string {
  return defaultId && availableIds.includes(defaultId) ? defaultId : ''
}
