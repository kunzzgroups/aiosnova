import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconCalendar } from '@/components/icons/Icons'
import { DateCalendar } from './DateCalendar'
import { Button } from './Button'
import './DateField.css'

type DateFieldProps = { id: string; label: string; value: string; onChange: (value: string) => void }

function dateValue(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return value ? new Date(year, month - 1, day) : new Date()
}
function monthStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1) }

export function DateField({ id, label, value, onChange }: DateFieldProps) {
  const { t, i18n } = useTranslation()
  const dialogId = useId()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthStart(parseDate(value)))
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const locale = i18n.language
  const today = dateValue(new Date())
  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }
  function select(next: string) { onChange(next); close(true) }
  useLayoutEffect(() => {
    if (!open) return
    function positionPopup() {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const popup = popupRef.current
      if (!trigger || !popup) return
      const gap = 8
      const left = Math.max(gap, Math.min(trigger.left, window.innerWidth - popup.offsetWidth - gap))
      const below = trigger.bottom + gap
      const top = below + popup.offsetHeight <= window.innerHeight - gap ? below : Math.max(gap, trigger.top - popup.offsetHeight - gap)
      setPosition(current => current.left === left && current.top === top ? current : { left, top })
    }
    positionPopup()
    window.addEventListener('resize', positionPopup)
    window.addEventListener('scroll', positionPopup, true)
    return () => { window.removeEventListener('resize', positionPopup); window.removeEventListener('scroll', positionPopup, true) }
  }, [open, month, locale])
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return <div className="ui-date-field">
    <button ref={triggerRef} id={id} type="button" className="ui-date-field__trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      onClick={() => { if (open) close(); else { const date = parseDate(value || today); setMonth(monthStart(date)); setOpen(true) } }}>
      <span className={value ? undefined : 'ui-date-field__placeholder'}>{value ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parseDate(value)) : t('dateField.chooseDate')}</span>
      <IconCalendar aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popupRef} id={dialogId} className="ui-date-field__popup" role="dialog" aria-label={label} style={position}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !triggerRef.current?.contains(event.relatedTarget as Node)) close() }}>
      <DateCalendar month={month} onMonthChange={setMonth} value={value} onChange={select} today={today} autoFocus />
      <footer className="ui-date-field__footer"><Button variant="ghost" onClick={() => select('')}>{t('dateField.clear')}</Button><Button variant="secondary" onClick={() => select(today)}>{t('dateField.today')}</Button></footer>
    </div>, document.body)}
  </div>
}
