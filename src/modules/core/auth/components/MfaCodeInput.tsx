import { TextField } from '@/components/ui/TextField'
import './MfaCodeInput.css'

type MfaCodeInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  hasError?: boolean
  disabled?: boolean
}

export function MfaCodeInput({ id, value, onChange, hasError = false, disabled = false }: MfaCodeInputProps) {
  return (
    <TextField
      id={id}
      className="mfa-code-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      maxLength={6}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      hasError={hasError}
      disabled={disabled}
    />
  )
}
