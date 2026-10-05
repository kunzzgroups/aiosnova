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
  const menuId = useId()

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

  if (items.length === 0) {
    return null
  }

  return (
    <div className="row-menu" ref={rootRef}>
      <button
        type="button"
        className="row-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>

      {open ? (
        <div className="row-menu__list" role="menu" id={menuId}>
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
