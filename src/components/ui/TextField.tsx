import type { InputHTMLAttributes } from 'react'
import './TextField.css'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
}

export function TextField({ hasError = false, className = '', ...props }: TextFieldProps) {
  const classes = ['ui-text-field', hasError ? 'ui-text-field--error' : '', className]
    .filter(Boolean)
    .join(' ')

  return <input className={classes} {...props} />
}
