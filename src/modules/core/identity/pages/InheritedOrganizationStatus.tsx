import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export function InheritedOrganizationStatus({ name, showReason }: { name: string; showReason: boolean }) {
  const { t } = useTranslation()
  const id = useId()
  const reasonRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const reason = t('org.inactiveReasonLabel')
  const fullReason = t('org.inactiveBecause', { name })

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const anchor = reasonRef.current
      const tooltip = tooltipRef.current
      if (!anchor || !tooltip) return
      const rect = anchor.getBoundingClientRect()
      const top = rect.top - tooltip.offsetHeight - 8
      setPosition({
        top: Math.max(8, Math.min(top >= 8 ? top : rect.bottom + 8, window.innerHeight - tooltip.offsetHeight - 8)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 8)),
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, fullReason])

  const badge = <span className="organization-status organization-status--inactive">{t('org.statusInactive')}</span>
  if (!showReason) return badge
  return <span className="organization-status organization-status--inactive">
    {t('org.statusInactive')}
    <span ref={reasonRef} tabIndex={0} className="organization-status-reason" aria-label={reason} aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => { setOpen(false); setPosition(null) }}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setPosition(null) }}
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setPosition(null) } }}><span aria-hidden="true">ⓘ</span></span>
    {open ? createPortal(<span ref={tooltipRef} id={id} role="tooltip" className={'ui-icon-button__tooltip organization-status-tooltip'+(position ? ' is-ready' : '')} style={position || undefined}>{fullReason}</span>, document.body) : null}
  </span>
}
