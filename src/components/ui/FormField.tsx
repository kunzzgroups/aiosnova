import type { ReactNode } from 'react'
import './FormField.css'

type FormFieldProps = {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}

export function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <div className="ui-form-field">
      <label className="ui-form-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="ui-form-field__error">{error}</p> : null}
      {!error && hint ? <p className="ui-form-field__hint">{hint}</p> : null}
    </div>
  )
}
