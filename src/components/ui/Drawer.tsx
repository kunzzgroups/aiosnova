import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@/components/icons/Icons'
import './Drawer.css'

type DrawerProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  /** Pinned below the scrolling body. Submit buttons inside use `form="…"`. */
  footer?: ReactNode
  onClose: () => void
  /** Blocks Escape and backdrop dismissal while a request is in flight. */
  busy?: boolean
  /** Accessible name for the close button. */
  closeLabel: string
}

/**
 * Right-hand side panel.
 *
 * Chosen over a centred dialog for record forms: the list stays visible behind
 * it, so you keep your place. Conventions match `ConfirmDialog` - portal to
 * `body`, Escape to close, backdrop click to close, both suppressed while
 * `busy`, plus a body scroll lock.
 *
 * `footer` is rendered OUTSIDE the scrolling body, so the actions stay reachable
 * in a long form. A submit button there targets the form by id.
 */
export function Drawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
  closeLabel,
}: DrawerProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, onClose])

  // The panel owns the viewport while it is open; the page behind must not scroll.
  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="ui-drawer-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <div className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ui-drawer__header">
          <div className="ui-drawer__heading">
            <h3 id={titleId} className="ui-drawer__title">
              {title}
            </h3>
            {description ? <p className="ui-drawer__description">{description}</p> : null}
          </div>
          <button
            type="button"
            className="ui-drawer__close"
            onClick={onClose}
            disabled={busy}
            aria-label={closeLabel}
          >
            <IconX />
          </button>
        </header>
        <div className="ui-drawer__body">{children}</div>
        {footer ? <div className="ui-drawer__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
