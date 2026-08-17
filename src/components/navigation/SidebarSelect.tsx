import { useEffect, useId, useRef, useState } from 'react'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import './SidebarSelect.css'

type SidebarSelectProps = {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

export function SidebarSelect({ label, value, options, onChange }: SidebarSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="sidebar-select" ref={rootRef}>
      <span className="sidebar-select__label">{label}</span>
      <button
        type="button"
        className={['sidebar-select__trigger', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sidebar-select__value">{value}</span>
        <span className="sidebar-select__chevron" aria-hidden>
          <IconChevron />
        </span>
      </button>

      {open ? (
        <ul className="sidebar-select__menu" id={listId} role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option === value
            return (
              <li key={option} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={['sidebar-select__option', selected ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                >
                  {option}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
