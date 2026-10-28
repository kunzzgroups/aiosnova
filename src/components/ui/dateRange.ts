export type DateRange = { from: string; to: string }
export type RangePreset = 'today' | 7 | 14 | 30 | 90

export function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
export function parseDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}
export function addMonths(date: Date, offset: number) { return new Date(date.getFullYear(), date.getMonth() + offset, 1) }
export function zonedDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''
  return part('year') + '-' + part('month') + '-' + part('day')
}
export function presetRange(preset: RangePreset, now: Date, timeZone: string): DateRange {
  const to = zonedDate(now, timeZone)
  if (preset === 'today') return { from: to, to }
  const from = parseDay(to)
  from.setDate(from.getDate() - (preset - 1))
  return { from: dateKey(from), to }
}
export function validRange(range: DateRange) { return Boolean(range.from && range.to && range.from <= range.to) }

// A hover preview changes only the visual range, never the pending selection.
export function previewRange(range: DateRange, endpoint: 'from' | 'to', hovered: string | null): DateRange | undefined {
  if (!hovered) return undefined
  const anchor = endpoint === 'from' ? range.to : range.from
  if (!anchor) return { from: hovered, to: hovered }
  return hovered < anchor ? { from: hovered, to: anchor } : { from: anchor, to: hovered }
}
