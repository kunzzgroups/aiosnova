import { TextField } from '@/components/ui/TextField'
import './MfaCodeInput.css'

type MfaCodeInputProps = {
  id: string
  value: string
  onChange: (value: string) => void
  hasError?: boolean
  disabled?: boolean
  segmented?: boolean
}

export function MfaCodeInput({ id, value, onChange, hasError = false, disabled = false, segmented = false }: MfaCodeInputProps) {
  const input = (
    <TextField
      id={id}
      className="mfa-code-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder={segmented ? undefined : '123456'}
      maxLength={6}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      hasError={hasError}
      disabled={disabled}
    />
  )
  return segmented ? <div className={`mfa-code-entry${hasError ? ' mfa-code-entry--error' : ''}`}>
    <div className="mfa-code-entry__digits" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <span key={index}>{value[index] || '–'}</span>)}
    </div>
    {input}
  </div> : input
}
