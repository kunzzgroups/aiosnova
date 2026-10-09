import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Popover.css'

type PopoverProps = {
  label: string
  trigger: ReactNode
  children: ReactNode
}

export function Popover({ label, trigger, children }: PopoverProps) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const button = triggerRef.current!
    const panel = panelRef.current!

    function reposition() {
      const viewport = window.visualViewport
      const inset = 16
      const gap = 8
      const leftEdge = (viewport?.offsetLeft ?? 0) + inset
      const topEdge = (viewport?.offsetTop ?? 0) + inset
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - inset * 2
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - inset * 2
      const anchor = button.getBoundingClientRect()
      if (anchor.bottom < topEdge || anchor.top > bottomEdge || anchor.right < leftEdge || anchor.left > rightEdge) {
        setOpen(false)
        return
      }
      panel.style.width = `${Math.min(280, rightEdge - leftEdge)}px`
      panel.style.maxHeight = `${Math.min(384, bottomEdge - topEdge)}px`
      const height = panel.offsetHeight
      const below = bottomEdge - anchor.bottom - gap
      const above = anchor.top - topEdge - gap
      const placeAbove = below < height && above > below
      panel.style.maxHeight = `${Math.max(0, Math.min(384, placeAbove ? above : below))}px`
      panel.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - panel.offsetWidth))}px`
      panel.style.top = `${placeAbove ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap}px`
    }

    function isInside(target: EventTarget | null) {
      return target instanceof Node && (button.contains(target) || panel.contains(target))
    }

    function dismiss(event: Event) {
      if (!isInside(event.target)) setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        button.focus({ preventScroll: true })
      }
    }

    reposition()
    panel.focus({ preventScroll: true })
    const observer = new ResizeObserver(reposition)
    observer.observe(button)
    observer.observe(panel)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('scroll', reposition)
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return <>
    <button ref={triggerRef} type="button" className="ui-popover-trigger" aria-label={label}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>{trigger}</button>
    {open ? createPortal(
      <div ref={panelRef} id={id} className="ui-popover" role="dialog" aria-label={label} tabIndex={-1}>
        {children}
      </div>, document.body,
    ) : null}
  </>
}
