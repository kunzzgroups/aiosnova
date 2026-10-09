import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { IconAlertTriangle } from '@/components/icons/Icons'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: ReactNode
  warning?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string
  busy?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  warning = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busyLabel = 'Deleting…',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef=useRef<HTMLDivElement>(null)
  const titleId=useId()
  const descriptionId=useId()
  useEffect(() => {
    if (!open) return
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    function trapFocus(event:KeyboardEvent) {
      if (event.key!=='Tab') return
      const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[])
      const first=controls[0],last=controls[controls.length-1]
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
      if (event.shiftKey&&document.activeElement===first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey&&document.activeElement===last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown',trapFocus)
    return () => { document.removeEventListener('keydown',trapFocus); previous?.focus() }
  },[open])
  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, busy, onCancel])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="ui-confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel()
        }
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className="ui-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="ui-confirm-dialog__icon" aria-hidden>
          <IconAlertTriangle />
        </div>
        <h3 id={titleId} className="ui-confirm-dialog__title">
          {title}
        </h3>
        <div id={descriptionId} className="ui-confirm-dialog__copy">
          <div className="ui-confirm-dialog__body">{description}</div>
          {warning ? <p className="ui-confirm-dialog__warning">{warning}</p> : null}
        </div>
        <div className="ui-confirm-dialog__actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy||confirmDisabled}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
