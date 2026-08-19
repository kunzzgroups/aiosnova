import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import './IconButton.css'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
}

export function IconButton({
  label,
  variant = 'secondary',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  const tooltipId = useId()

  return (
    <span className="ui-icon-button-wrap">
      <Button
        variant={variant}
        size="icon"
        className={['ui-icon-button', className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-describedby={tooltipId}
        {...props}
      >
        {children}
      </Button>
      <span className="ui-icon-button__tooltip" id={tooltipId} role="tooltip">
        {label}
      </span>
    </span>
  )
}
