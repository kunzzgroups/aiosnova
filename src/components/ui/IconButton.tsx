import { useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import './IconButton.css'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
}

type TooltipPosition = {
  top: number
  left: number
  arrowLeft: number
}

export function IconButton({
  label,
  variant = 'secondary',
  className = '',
  children,
  onBlur,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  ...props
}: IconButtonProps) {
  const tooltipId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    updatePosition()
    function handleReposition() {
      updatePosition()
    }
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open, label])

  function updatePosition() {
    const button = buttonRef.current
    const tooltip = tooltipRef.current
    if (!button || !tooltip) {
      return
    }
    const rect = button.getBoundingClientRect()
    const tipWidth = tooltip.offsetWidth
    const tipHeight = tooltip.offsetHeight
    const gap = 10
    const minPad = 8
    const preferredLeft = rect.left + rect.width / 2 - tipWidth / 2
    const left = Math.max(minPad, Math.min(preferredLeft, window.innerWidth - tipWidth - minPad))
    const top = Math.max(minPad, rect.top - tipHeight - gap)
    const arrowLeft = rect.left + rect.width / 2 - left
    setPosition({ top, left, arrowLeft })
  }

  function show() {
    setOpen(true)
  }

  function hide() {
    setOpen(false)
    setPosition(null)
  }

  return (
    <span className="ui-icon-button-wrap">
      <Button
        ref={buttonRef}
        variant={variant}
        size="icon"
        className={['ui-icon-button', className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={(event) => {
          onMouseEnter?.(event)
          show()
        }}
        onMouseLeave={(event) => {
          onMouseLeave?.(event)
          hide()
        }}
        onFocus={(event) => {
          onFocus?.(event)
          show()
        }}
        onBlur={(event) => {
          onBlur?.(event)
          hide()
        }}
        {...props}
      >
        {children}
      </Button>
      {open
        ? createPortal(
            <span
              ref={tooltipRef}
              className={['ui-icon-button__tooltip', position ? 'is-ready' : ''].filter(Boolean).join(' ')}
              id={tooltipId}
              role="tooltip"
              style={
                position
                  ? {
                      top: position.top,
                      left: position.left,
                      ['--tooltip-arrow-left' as string]: `${position.arrowLeft}px`,
                    }
                  : undefined
              }
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
