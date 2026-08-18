import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import './PasswordField.css'

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.7a3 3 0 0 0 4.2 4.2M9.9 5.2A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a16.6 16.6 0 0 1-3.3 4.1M6.5 6.7C4.3 8.4 2.5 12 2.5 12s3.5 7 9.5 7c1.3 0 2.5-.3 3.6-.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type PasswordFieldProps = {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  hasError?: boolean
  disabled?: boolean
  revealed?: boolean
  onRevealedChange?: (revealed: boolean) => void
}

export function PasswordField({
  id,
  name,
  value,
  onChange,
  autoComplete = 'current-password',
  hasError = false,
  disabled = false,
  revealed,
  onRevealedChange,
}: PasswordFieldProps) {
  const [uncontrolledRevealed, setUncontrolledRevealed] = useState(false)
  const isRevealed = revealed ?? uncontrolledRevealed

  function setIsRevealed(next: boolean) {
    onRevealedChange?.(next)
    if (revealed === undefined) {
      setUncontrolledRevealed(next)
    }
  }

  return (
    <div className="password-field">
      <TextField
        id={id}
        name={name}
        type={isRevealed ? 'text' : 'password'}
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
        onClick={() => setIsRevealed(!isRevealed)}
        aria-label={isRevealed ? 'Hide password' : 'Show password'}
        title={isRevealed ? 'Hide password' : 'Show password'}
      >
        {isRevealed ? <IconEyeOff /> : <IconEye />}
      </Button>
    </div>
  )
}
