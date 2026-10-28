import { Fragment as ReactFragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconCalendar } from '@/components/icons/Icons'
import { Button } from './Button'
import { DateCalendar } from './DateCalendar'
import { addMonths, parseDay, presetRange, previewRange, validRange, zonedDate, type DateRange, type RangePreset } from './dateRange'
import './DateRangeField.css'

type Props = { id: string; label: string; value: DateRange; onChange: (range: DateRange) => void; timeZone: string }
type Endpoint = 'from' | 'to'
const PRESETS: RangePreset[] = ['today', 7, 14, 30, 90]
function display(value: string) { return value.replaceAll('-', '/') }

export function DateRangeField({ id, label, value, onChange, timeZone }: Props) {
  const { t } = useTranslation()
  const popupId = useId()
  const trigger = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DateRange>(value)
  const [active, setActive] = useState<Endpoint>('from')
  const [hovered, setHovered] = useState<string | null>(null)
  const [hoveredPreset, setHoveredPreset] = useState<DateRange | undefined>()
  const [preset, setPreset] = useState<RangePreset | null>(null)
  const [month, setMonth] = useState(() => addMonths(parseDay(value.from || zonedDate(new Date(), timeZone)), 0))
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const today = zonedDate(new Date(), timeZone)
  const preview = hoveredPreset ?? previewRange(pending, active, hovered)
  const shown = open ? preview ?? pending : value
  const valid = validRange(pending)
  const reversed = Boolean(pending.from && pending.to && pending.from > pending.to)
  function close(restore = false) { setOpen(false); if (restore) trigger.current?.querySelector<HTMLButtonElement>('[data-endpoint="' + active + '"]')?.focus() }
  function openPicker(endpoint: Endpoint) {
    setPending(value); setPreset(null); setActive(endpoint); setHovered(null); setHoveredPreset(undefined)
    setMonth(addMonths(parseDay(value[endpoint] || value.from || today), endpoint === 'to' ? -1 : 0)); setOpen(true)
  }
  function selectDate(date: string) {
    setHovered(null)
    setPreset(null)
    setPending(previous => ({ ...previous, [active]: date }))
    if (active === 'from') setActive('to')
  }
  function choosePreset(next: RangePreset) {
    const range = presetRange(next, new Date(), timeZone)
    setHovered(null)
    setHoveredPreset(undefined)
    setPending(range); setPreset(next); setActive('from'); setMonth(addMonths(parseDay(range.from), 0))
  }
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const anchor = trigger.current?.getBoundingClientRect()
      const panel = popup.current
      if (!anchor || !panel) return
      const gap = 8
      const left = Math.max(gap, Math.min(anchor.left, window.innerWidth - panel.offsetWidth - gap))
      const top = anchor.bottom + gap + panel.offsetHeight <= window.innerHeight - gap ? anchor.bottom + gap : Math.max(gap, anchor.top - panel.offsetHeight - gap)
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top })
    }
    place()
    const observer = new ResizeObserver(place)
    if (popup.current) observer.observe(popup.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      const node = event.target as Node
      if (!popup.current?.contains(node) && !trigger.current?.contains(node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return <div className="ui-date-range">
    <div ref={trigger} className="ui-date-field__trigger ui-date-range__trigger" role="group" aria-label={label}
      onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); close(true) } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !popup.current?.contains(event.relatedTarget as Node)) close() }}>
      {(['from', 'to'] as const).map((endpoint, index) => <ReactFragment key={endpoint}>
        {index === 1 && <span aria-hidden="true" className="ui-date-range__arrow">→</span>}
        <button type="button" id={endpoint === 'from' ? id : id + '-to'} data-endpoint={endpoint}
          className="ui-date-range__endpoint-trigger" data-active={open && active === endpoint}
          aria-label={t(endpoint === 'from' ? 'dateRange.start' : 'dateRange.end') + (shown[endpoint] ? ': ' + display(shown[endpoint]) : '')}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
          onClick={() => { if (!open) openPicker(endpoint); else { setActive(endpoint); setHovered(null); setHoveredPreset(undefined) } }}>
          <span className={open && preview && shown[endpoint] !== pending[endpoint] ? 'ui-date-range__value--preview' : !shown[endpoint] ? 'ui-date-field__placeholder' : undefined}>
            {shown[endpoint] ? display(shown[endpoint]) : t(endpoint === 'from' ? 'dateRange.start' : 'dateRange.end')}
          </span>
          {endpoint === 'to' && <IconCalendar aria-hidden="true" />}
        </button>
      </ReactFragment>)}
    </div>
    {open && createPortal(<div ref={popup} id={popupId} className="ui-date-range__popup" role="dialog" aria-label={label} style={position}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !trigger.current?.contains(event.relatedTarget as Node)) close() }}>
      <div className="ui-date-range__body">
        <nav className="ui-date-range__presets" aria-label={t('dateRange.presets')} onPointerLeave={() => setHoveredPreset(undefined)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHoveredPreset(undefined) }}>
          {PRESETS.map(item => <Button key={item} variant="ghost" aria-pressed={preset === item} onPointerEnter={() => setHoveredPreset(presetRange(item, new Date(), timeZone))} onFocus={() => setHoveredPreset(presetRange(item, new Date(), timeZone))} onClick={() => choosePreset(item)}>{item === 'today' ? t('dateField.today') : t('dateRange.lastDays', { count: item })}</Button>)}
        </nav>
        <div className="ui-date-range__main">
          <div className="ui-date-range__calendars" onPointerLeave={() => setHovered(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(null) }}>
            <DateCalendar month={month} onMonthChange={setMonth} value={pending[active].slice(0, 10)} range={pending} preview={preview} onPreview={setHovered} today={today} onChange={selectDate} autoFocus />
            <DateCalendar month={addMonths(month, 1)} onMonthChange={date => setMonth(addMonths(date, -1))} value={pending[active].slice(0, 10)} range={pending} preview={preview} onPreview={setHovered} today={today} onChange={selectDate} />
          </div>
          {reversed && <p className="ui-date-range__error" role="alert">{t('dateRange.invalid')}</p>}
        </div>
      </div>
      <footer className="ui-date-range__footer"><Button variant="ghost" onClick={() => { onChange({ from: '', to: '' }); close(true) }}>{t('dateField.clear')}</Button><Button variant="secondary" onClick={() => close(true)}>{t('dateRange.cancel')}</Button><Button disabled={!valid} onClick={() => { onChange(pending); close(true) }}>{t('dateField.apply')}</Button></footer>
    </div>, document.body)}
  </div>
}
