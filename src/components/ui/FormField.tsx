import type { ReactNode } from 'react'
import './FormField.css'

type FormFieldProps = {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, className = '', children }: FormFieldProps) {
  return (
    <div className={['ui-form-field', className].filter(Boolean).join(' ')}>
      <label className="ui-form-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p id={`${htmlFor}-error`} className="ui-form-field__error" role="alert">{error}</p> : null}
      {!error && hint ? <p className="ui-form-field__hint">{hint}</p> : null}
    </div>
  )
}
