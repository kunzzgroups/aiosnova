import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import './PasswordField.css'

type PasswordFieldProps = {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  hasError?: boolean
  disabled?: boolean
}

export function PasswordField({
  id,
  name,
  value,
  onChange,
  autoComplete = 'current-password',
  hasError = false,
  disabled = false,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="password-field">
      <TextField
        id={id}
        name={name}
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        hasError={hasError}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="ghost"
        className="password-field__toggle"
        onClick={() => setRevealed((current) => !current)}
        aria-label={revealed ? 'Hide password' : 'Show password'}
      >
        {revealed ? 'Hide' : 'Show'}
      </Button>
    </div>
  )
}
