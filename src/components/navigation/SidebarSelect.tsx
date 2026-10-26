import { type AriaAttributes, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconChevron } from '@/components/navigation/SidebarIcons'
import './SidebarSelect.css'

/**
 * One entry in the picker. A plain string is enough for simple lists; pass an
 * object when the option needs a second line (a short description, a status,
 * etc.). `hint` renders below the label in a smaller muted font and turns the
 * option into a two-line card.
 */
export type SidebarSelectOption =
  | string
  | {
      value: string
      label: string
      /** Optional second line. When present, the option grows to two rows. */
      hint?: string
    }

type SidebarSelectProps = Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'> & {
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
   * "only one popover at a time" alongside the model picker and settings
   * panel.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  menuPortal?: boolean
  /** Keep the current option visible when reopening a long menu. */
  scrollSelectedIntoView?: boolean
}

type NormalizedOption = {
  value: string
  label: string
  hint?: string
}

function normalizeOptions(options: SidebarSelectOption[]): NormalizedOption[] {
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
  menuPortal = false,
  scrollSelectedIntoView = false,
}: SidebarSelectProps) {
  // `open` is potentially controlled. The uncontrolled path keeps its own
  // state under a distinct name; `setOpen` fans out to both the parent (via
  // onOpenChange) and the internal store.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next)
    }
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const generatedId = useId()
  const listId = id ? `${id}-list` : generatedId

  const items = normalizeOptions(options)
  const selected = items.find((item) => item.value === value) ?? null
  const selectedLabel = selected?.label ?? value
  useLayoutEffect(() => {
    if (!open || !menuPortal) return
    function position() {
      const trigger=rootRef.current?.querySelector('button'),menu=menuRef.current
      if(!trigger||!menu)return
      const rect=trigger.getBoundingClientRect(),below=window.innerHeight-rect.bottom-16,above=rect.top-16
      const height=Math.min(menu.scrollHeight,198),up=below<height&&above>below
      Object.assign(menu.style,{position:'fixed',left:Math.max(8,Math.min(rect.left,window.innerWidth-rect.width-8))+'px',width:Math.min(rect.width,window.innerWidth-16)+'px',minWidth:'0',maxWidth:'none',maxHeight:Math.max(32,Math.min(198,up?above:below))+'px',top:up?'auto':rect.bottom+6+'px',bottom:up?window.innerHeight-rect.top+6+'px':'auto',zIndex:'200'})
    }
    position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true)
    return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true)}
  },[open,menuPortal,items.length])

  useLayoutEffect(() => {
    if (!open || !scrollSelectedIntoView) return
    const menu = menuRef.current
    const selectedOption = menu?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!menu || !selectedOption) return
    menu.scrollTop = Math.max(0, selectedOption.offsetTop - (menu.clientHeight - selectedOption.offsetHeight) / 2)
  }, [open, value, scrollSelectedIntoView])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
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

  const menu = open ? (
        <ul ref={menuRef} className="sidebar-select__menu" id={listId} role="listbox" aria-label={label}>
          {items.map(option=><li key={option.value} role="presentation"><button type="button" role="option" aria-selected={option.value===value} className={['sidebar-select__option',option.value===value?'is-selected':'',option.hint?'has-hint':''].filter(Boolean).join(' ')} onClick={()=>{onChange(option.value);setOpen(false);rootRef.current?.querySelector('button')?.focus({preventScroll:true})}}><span className="sidebar-select__option-label">{option.label}</span>{option.hint?<span className="sidebar-select__option-hint">{option.hint}</span>:null}</button></li>)}
        </ul>
  ) : null
  return (
    <div
      className={['sidebar-select', className].filter(Boolean).join(' ')}
      ref={rootRef}
    >
      {hideLabel ? null : (
        <span className="sidebar-select__label">{label}</span>
      )}

      <button
        type="button"
        id={id}
        className={['sidebar-select__trigger', open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
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

      {menuPortal ? (open ? createPortal(<div className={`sidebar-select sidebar-select--portal ${className.split(/\s+/).filter(name => name !== 'console-form-select--down').join(' ')}`}>{menu}</div>,document.body) : null) : open ? (
        <ul
          ref={menuRef}
          className="sidebar-select__menu"
          id={listId}
          role="listbox"
          aria-label={label}
        >
          {items.map((option) => {
            const isSelected = option.value === value
            const hasHint = Boolean(option.hint)
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={[
                    'sidebar-select__option',
                    isSelected ? 'is-selected' : '',
                    hasHint ? 'has-hint' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="sidebar-select__option-label">
                    {option.label}
                  </span>
                  {hasHint ? (
                    <span className="sidebar-select__option-hint">
                      {option.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
