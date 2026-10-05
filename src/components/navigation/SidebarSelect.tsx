import { useEffect, useId, useRef, useState } from 'react'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import './SidebarSelect.css'

export type SidebarSelectOption = string | { value: string; label: string }

type SidebarSelectProps = {
  label: string
  value: string
  options: SidebarSelectOption[]
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  hideLabel?: boolean
  className?: string
  /** Optional native tooltip; useful when the selected value needs explaining. */
  title?: string
  /**
   * Controlled open state. When provided, the component no longer owns it —
   * the parent is then responsible for opening, closing, and enforcing
   * "only one popover at a time" alongside the model picker and settings panel.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function normalizeOptions(options: SidebarSelectOption[]) {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  )
}

export function SidebarSelect({
  label,
  value,
  options,
  onChange,
  id,
  disabled = false,
  hideLabel = false,
  className = '',
  title,
  open: controlledOpen,
  onOpenChange,
}: SidebarSelectProps) {
  // `open` above is now potentially controlled. The uncontrolled path keeps
  // its own state under a distinct name, and `setOpen` below fans out to both
  // the parent (via onOpenChange) and the internal store.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next)
    }
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const listId = id ? `${id}-list` : generatedId
  const items = normalizeOptions(options)
  const selectedLabel = items.find((item) => item.value === value)?.label ?? value

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
    <div
      className={['sidebar-select', className].filter(Boolean).join(' ')}
      ref={rootRef}
    >
      {hideLabel ? null : <span className="sidebar-select__label">{label}</span>}
      <button
        type="button"
        id={id}
        className={['sidebar-select__trigger', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className="sidebar-select__value">{selectedLabel}</span>
        <span className="sidebar-select__chevron" aria-hidden>
          <IconChevron />
        </span>
      </button>

      {open ? (
        <ul className="sidebar-select__menu" id={listId} role="listbox" aria-label={label}>
          {items.map((option) => {
            const selected = option.value === value
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={['sidebar-select__option', selected ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
