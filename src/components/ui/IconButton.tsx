import type { ButtonHTMLAttributes, ReactNode } from 'react'
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
  return (
    <Button
      variant={variant}
      size="icon"
      className={['ui-icon-button', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  )
}
