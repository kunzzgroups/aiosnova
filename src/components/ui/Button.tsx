import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import './Button.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'lg' | 'icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className = '',
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    fullWidth ? 'ui-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button ref={ref} type={type} className={classes} {...props}>
      {children}
    </button>
  )
})
