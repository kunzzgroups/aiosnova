import { useEffect, type ReactNode } from 'react'
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
  busy?: boolean
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
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
      <div className="ui-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="ui-confirm-dialog__icon" aria-hidden>
          <IconAlertTriangle />
        </div>
        <h3 id="confirm-dialog-title" className="ui-confirm-dialog__title">
          {title}
        </h3>
        <div className="ui-confirm-dialog__copy">
          <div className="ui-confirm-dialog__body">{description}</div>
          {warning ? <p className="ui-confirm-dialog__warning">{warning}</p> : null}
        </div>
        <div className="ui-confirm-dialog__actions">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
