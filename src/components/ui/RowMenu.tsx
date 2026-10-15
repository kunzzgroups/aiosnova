import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
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

type MenuPlacement = 'up' | 'down'

const MENU_GAP = 4
const VIEWPORT_PAD = 8

function nearestVerticalClipParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement

  while (parent) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY

    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'hidden' ||
      overflowY === 'clip'
    ) {
      return parent
    }

    parent = parent.parentElement
  }

  return null
}

/**
 * A row's "more actions" menu: a vertical-ellipsis trigger plus a dropdown.
 *
 * The menu automatically flips upward when there is not enough visible space
 * below the trigger. This is based on the nearest scrolling/clipping container,
 * not merely on whether the row happens to be one of the last rows.
 */
export function RowMenu({
  items,
  label,
  disabled = false,
}: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<MenuPlacement>('down')

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open) return

    let frame = 0

    function updatePlacement() {
      cancelAnimationFrame(frame)

      frame = requestAnimationFrame(() => {
        const root = rootRef.current
        const menu = menuRef.current
        if (!root || !menu) return

        const rootRect = root.getBoundingClientRect()
        const menuHeight = menu.offsetHeight
        const clipParent = nearestVerticalClipParent(root)
        const clipRect = clipParent?.getBoundingClientRect()

        const visibleTop = Math.max(
          VIEWPORT_PAD,
          clipRect?.top ?? VIEWPORT_PAD,
        )
        const visibleBottom = Math.min(
          window.innerHeight - VIEWPORT_PAD,
          clipRect?.bottom ?? window.innerHeight - VIEWPORT_PAD,
        )

        const spaceAbove = rootRect.top - visibleTop - MENU_GAP
        const spaceBelow = visibleBottom - rootRect.bottom - MENU_GAP

        setPlacement(
          spaceBelow < menuHeight && spaceAbove > spaceBelow
            ? 'up'
            : 'down',
        )
      })
    }

    updatePlacement()

    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    // Placement is measured during layout; focus after paint so the first item
    // is ready without causing a scroll jump in the parent list.
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus({ preventScroll: true })
    })

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
      cancelAnimationFrame(frame)
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
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <IconMore />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className={[
            'row-menu__list',
            placement === 'up' ? 'row-menu__list--up' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menu"
          id={menuId}
          aria-label={label}
          onKeyDown={(event) => {
            const buttons = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ) ?? [],
            )
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            )

            if (
              event.key === 'ArrowDown' ||
              event.key === 'ArrowUp' ||
              event.key === 'Home' ||
              event.key === 'End'
            ) {
              event.preventDefault()

              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        buttons.length) %
                      buttons.length

              buttons[next]?.focus()
            } else if (event.key === 'Tab') {
              setOpen(false)
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={[
                'row-menu__item',
                item.destructive ? 'row-menu__item--danger' : '',
              ]
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
