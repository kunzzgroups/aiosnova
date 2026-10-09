import { useEffect, useRef, useState } from 'react'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import './SelectField.css'

type SelectFieldProps = {
  id: string
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  onChange: (value: string) => void
}

export function SelectField({ id, label, value, options, disabled, onChange }: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const selected = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')
    const target = selected || list?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
    target?.focus()
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  return (
    <div className="ui-select-field" ref={rootRef}>
      <button type="button" id={id} ref={triggerRef} className="ui-select-field__trigger" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-options`} disabled={disabled}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>
        <span>{options.find(option => option.value === value)?.label}</span><IconChevron aria-hidden="true" />
      </button>
      {open ? <div id={`${id}-options`} className="ui-select-field__list" role="listbox" aria-label={label} ref={listRef}
        onKeyDown={event => {
          const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || [])
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
            triggerRef.current?.focus()
            setOpen(false)
          } else if (event.key.length === 1 && event.key !== ' ') {
            const match = buttons.find((button, offset) => offset > index && button.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) || buttons.find(button => button.textContent?.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))
            if (match) { event.preventDefault(); match.focus() }
          }
        }}>
        {options.map(option => <button type="button" role="option" tabIndex={-1} aria-selected={option.value === value} disabled={option.disabled} key={option.value} className="ui-select-field__option"
          onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus() }}>{option.label}</button>)}
      </div> : null}
    </div>
  )
}
