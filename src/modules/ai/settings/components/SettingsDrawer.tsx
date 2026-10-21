import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@/components/icons/Icons'

import '@/components/ui/Drawer.css'
import './SettingsDrawer.css'

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
  /** Keep a workspace drawer inside an existing page instead of the viewport. */
  portalTarget?: HTMLElement | null
  className?: string
  hideHeader?: boolean
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
export function SettingsDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
  closeLabel,
  portalTarget,
  className = '',
  hideHeader = false,
}: DrawerProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !portalTarget) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus()
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialogRef.current?.contains(document.activeElement)) return
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')).filter(control => control.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', trapFocus)
    return () => { window.removeEventListener('keydown', trapFocus); if (previous?.isConnected) previous.focus() }
  }, [open, portalTarget])

  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, onClose])

  // The panel owns the viewport while it is open; the page behind must not scroll.
  useEffect(() => {
    if (!open || portalTarget) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open, portalTarget])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className={`ui-drawer-overlay ai-settings-drawer${portalTarget ? ' ui-drawer-overlay--contained' : ''}${className ? ` ${className}` : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <div ref={dialogRef} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={hideHeader ? undefined : titleId} aria-label={hideHeader ? title : undefined}>
        {!hideHeader ? <header className="ui-drawer__header">
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
        </header> : null}
        <div className="ui-drawer__body">{children}</div>
        {footer ? <div className="ui-drawer__footer">{footer}</div> : null}
      </div>
    </div>,
    portalTarget ?? document.body,
  )
}
