import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { IconAlertTriangle } from '@/components/icons/Icons'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  open: boolean
  className?: string
  variant?: 'default' | 'deletion'
  title: string
  items?: { id:string; name:string; details?:ReactNode }[]
  description: ReactNode
  error?: string | null
  warning?: ReactNode
  warningTitle?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Shown on the confirm button while `busy`. */
  busyLabel?: string
  busy?: boolean
  confirmDisabled?: boolean
  hideConfirm?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  className = '',
  variant = 'default',
  title,
  description,
  error,
  warning,
  warningTitle,
  confirmLabel,
  cancelLabel,
  busyLabel,
  busy = false,
  confirmDisabled = false,
  hideConfirm = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t }=useTranslation()
  const dialogRef=useRef<HTMLDivElement>(null)
  const cancelRef=useRef<HTMLButtonElement>(null)
  const submittingRef=useRef(false)
  const [submitting,setSubmitting]=useState(false)
  const isBusy=busy||submitting
  const titleId=useId()
  const descriptionId=useId()
  const errorId=useId()
  useEffect(() => {
    if (!open) return
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    function trapFocus(event:KeyboardEvent) {
      if (event.key!=='Tab') return
      const controls=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')||[]).filter(control=>control.getClientRects().length>0)
      const first=controls[0],last=controls[controls.length-1]
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); return }
      if (event.shiftKey&&document.activeElement===first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey&&document.activeElement===last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown',trapFocus)
    return () => {
      document.removeEventListener('keydown',trapFocus)
      if(previous?.isConnected) previous.focus()
      else document.querySelector<HTMLElement>('main button:not(:disabled), main a[href]')?.focus()
    }
  },[open])
  useEffect(() => {
    if (!open) {
      return
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!isBusy&&!submittingRef.current) onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isBusy, onCancel])

  async function confirm() {
    if(isBusy||confirmDisabled||submittingRef.current) return
    submittingRef.current=true
    setSubmitting(true)
    try { await onConfirm() }
    finally { submittingRef.current=false;setSubmitting(false) }
  }

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="ui-confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy&&!submittingRef.current) {
          onCancel()
        }
      }}
    >
      <div ref={dialogRef} tabIndex={-1} className={['ui-confirm-dialog',variant==='deletion' ? 'ui-confirm-dialog--deletion' : '',className].filter(Boolean).join(' ')} role="alertdialog" aria-modal="true" aria-busy={isBusy} aria-labelledby={titleId} aria-describedby={[descriptionId,error ? errorId : ''].filter(Boolean).join(' ')}>
        <div className="ui-confirm-dialog__icon" aria-hidden>
          <IconAlertTriangle />
        </div>
        <h3 id={titleId} className="ui-confirm-dialog__title">
          {title}
        </h3>
        <div id={descriptionId} className="ui-confirm-dialog__copy">
          <div className="ui-confirm-dialog__body">
            {description}
          </div>
          {warning ? warningTitle ? <div className="ui-confirm-dialog__warning-panel"><IconAlertTriangle aria-hidden="true" /><div><strong>{warningTitle}</strong><div>{warning}</div></div></div> : <p className="ui-confirm-dialog__warning">{warning}</p> : null}
        </div>
        {error ? <p id={errorId} className="ui-confirm-dialog__error" role="alert">{error}</p> : null}
        <div className="ui-confirm-dialog__actions">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={()=>{if(!submittingRef.current&&!isBusy) onCancel()}} disabled={isBusy}>
            {cancelLabel||t('confirmation.cancel')}
          </Button>
          {!hideConfirm ? <Button type="button" variant="danger" onClick={()=>void confirm()} disabled={isBusy||confirmDisabled}>
            {isBusy ? busyLabel||t('confirmation.deleting') : confirmLabel||t('confirmation.delete')}
          </Button> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
