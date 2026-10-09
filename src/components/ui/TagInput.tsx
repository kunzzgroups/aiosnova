import { TextField } from './TextField'
import { Button } from './Button'
import { IconX } from '@/components/icons/Icons'
import './TagInput.css'

type TagInputProps = {
  id: string
  items: { id: number; name: string }[]
  value: string
  onValueChange: (value: string) => void
  error: string | null
  onErrorChange: (error: string | null) => void
  onAdd: (name: string) => void
  onRemove: (id: number) => void
  removeLabel: (name: string) => string
  placeholder?: string
  hint?: string
  addLabel?: string
  queueLabel?: string
  validate: (name: string) => string | null
  disabled?: boolean
  autoFocus?: boolean
}

export function TagInput({ id, items, value, onValueChange, error, onErrorChange, onAdd, onRemove, removeLabel, placeholder, hint, addLabel, queueLabel, validate, disabled, autoFocus }: TagInputProps) {

  function add() {
    const name = value.trim()
    const message = validate(name)
    onErrorChange(message)
    if (message) return
    onAdd(name)
    onValueChange('')
  }

  return (
    <div className="ui-tag-input">
      <div className="ui-tag-input__entry">
      <TextField id={id} value={value} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus} hasError={Boolean(error)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={event => { onValueChange(event.target.value); onErrorChange(null) }}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          add()
        }}
      />
      {addLabel ? <Button variant="secondary" disabled={disabled} onClick={add}>{addLabel}</Button> : null}
      </div>
      {error ? <p className="ui-tag-input__error" id={`${id}-error`} role="alert">{error}</p> : null}
      {hint ? <p className="ui-tag-input__hint" id={`${id}-hint`}>{hint}</p> : null}
      {queueLabel ? <h3 className="ui-tag-input__queue-title">{queueLabel}</h3> : null}
      <div className="ui-tag-input__chips">
        {items.map(item => (
          <div className="ui-tag-input__chip" key={item.id}>
            <span>{item.name}</span>
            <Button variant="ghost" size="icon" className="ui-tag-input__remove" disabled={disabled} aria-label={removeLabel(item.name)} onClick={() => onRemove(item.id)}><IconX aria-hidden="true" /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
