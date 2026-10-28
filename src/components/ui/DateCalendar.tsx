import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { addMonths, dateKey } from './dateRange'
import './DateField.css'

type Props = {
  month: Date; onMonthChange: (date: Date) => void; value: string; onChange: (date: string) => void
  range?: { from: string; to: string }; preview?: { from: string; to: string }; onPreview?: (date: string | null) => void; today: string; autoFocus?: boolean
}

export function DateCalendar({ month, onMonthChange, value, onChange, range, preview, onPreview, today, autoFocus = false }: Props) {
  const { t, i18n } = useTranslation()
  const initial = value && value.slice(0, 7) === dateKey(month).slice(0, 7) ? value : dateKey(month)
  const [focused, setFocused] = useState(initial)
  const shouldFocus = useRef(autoFocus)
  const root = useRef<HTMLDivElement>(null)
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay())
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + index))
  const tabDate = focused.slice(0, 7) === dateKey(month).slice(0, 7) ? focused : dateKey(month)
  useEffect(() => {
    if (shouldFocus.current) {
      root.current?.querySelector<HTMLButtonElement>('[data-date="' + tabDate + '"]')?.focus()
      shouldFocus.current = false
    }
  }, [tabDate, month])
  function onKey(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const next = new Date(date)
    switch (event.key) {
      case 'ArrowLeft': next.setDate(next.getDate() - 1); break
      case 'ArrowRight': next.setDate(next.getDate() + 1); break
      case 'ArrowUp': next.setDate(next.getDate() - 7); break
      case 'ArrowDown': next.setDate(next.getDate() + 7); break
      case 'Home': next.setDate(next.getDate() - next.getDay()); break
      case 'End': next.setDate(next.getDate() + 6 - next.getDay()); break
      case 'PageUp':
      case 'PageDown': {
        const target = addMonths(date, event.key === 'PageUp' ? -1 : 1)
        next.setTime(target.getTime())
        next.setDate(Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()))
        break
      }
      default: return
    }
    event.preventDefault()
    shouldFocus.current = true
    setFocused(dateKey(next))
    onPreview?.(dateKey(next))
    onMonthChange(addMonths(next, 0))
  }
  return <div ref={root} className="ui-date-calendar">
    <header className="ui-date-field__header">
      <Button variant="ghost" size="icon" aria-label={t('dateField.previousMonth')} onClick={() => onMonthChange(addMonths(month, -1))}>‹</Button>
      <strong aria-live="polite">{new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'long' }).format(month)}</strong>
      <Button variant="ghost" size="icon" aria-label={t('dateField.nextMonth')} onClick={() => onMonthChange(addMonths(month, 1))}>›</Button>
    </header>
    <div className="ui-date-field__weekdays" aria-hidden="true">{weekdays.map(day => <span key={day.getDay()}>{new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(day)}</span>)}</div>
    <div className="ui-date-field__days">{days.map(date => {
      const key = dateKey(date)
      const outside = date.getMonth() !== month.getMonth()
      const shownRange = preview ?? range
      const selected = range ? key === range.from || key === range.to : key === value
      const edge = !outside && (shownRange ? key === shownRange.from || key === shownRange.to : key === value)
      const inside = !outside && shownRange && shownRange.from && shownRange.to && key > shownRange.from && key < shownRange.to
      return <button type="button" key={key} data-date={key} className={'ui-date-field__day' + (outside ? ' ui-date-field__day--outside' : '') + (edge ? ' ui-date-field__day--selected' : '') + (inside ? ' ui-date-field__day--in-range' : '')}
        tabIndex={key === tabDate ? 0 : -1} aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full' }).format(date)} aria-pressed={selected} aria-current={key === today ? 'date' : undefined}
        onPointerEnter={() => onPreview?.(outside ? null : key)} onKeyDown={event => onKey(event, date)} onClick={() => { setFocused(key); onChange(key) }}>{date.getDate()}</button>
    })}</div>
  </div>
}
