import { useEffect, useId, useRef, useState } from 'react'
import { IconMore } from '@/components/icons/Icons'
import './RowMenu.css'

export type RowMenuItem = {
  id: string
  label: string
  /** Renders in the danger colour. Does not confirm anything by itself. */
  destructive?: boolean
  onSelect: () => void
}

type RowMenuProps = {
  items: RowMenuItem[]
  /** Accessible name for the trigger - include the row's name, e.g. "Actions for HR Knowledge". */
  label: string
  disabled?: boolean
}

/**
 * A row's "more actions" menu: a vertical-ellipsis trigger plus a dropdown.
 *
 * Kept separate from the row's link on purpose - a `<button>` nested inside an
 * `<a>` is invalid and would make the link swallow the click. Callers render this
 * as a SIBLING of the link.
 */
export function RowMenu({ items, label, disabled = false }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="row-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="row-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={event => {
          if (event.key==='ArrowDown'||event.key==='ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <IconMore />
      </button>

      {open ? (
        <div ref={menuRef} className="row-menu__list" role="menu" id={menuId} aria-label={label}
          onKeyDown={event => {
            const buttons=Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')||[])
            const index=buttons.indexOf(document.activeElement as HTMLButtonElement)
            if (event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End') {
              event.preventDefault()
              const next=event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : (index+(event.key==='ArrowDown' ? 1 : -1)+buttons.length)%buttons.length
              buttons[next]?.focus()
            } else if (event.key==='Tab') setOpen(false)
          }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={['row-menu__item', item.destructive ? 'row-menu__item--danger' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
