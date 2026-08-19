import type { ChangeEvent, ClipboardEvent, InputHTMLAttributes } from 'react'
import './TextField.css'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean
}

export function TextField({
  hasError = false,
  className = '',
  onCopy,
  onPaste,
  onChange,
  ...props
}: TextFieldProps) {
  const classes = ['ui-text-field', hasError ? 'ui-text-field--error' : '', className]
    .filter(Boolean)
    .join(' ')

  function emitChange(input: HTMLInputElement, next: string) {
    if (!onChange) {
      input.value = next
      return
    }
    input.value = next
    onChange({
      target: input,
      currentTarget: input,
    } as ChangeEvent<HTMLInputElement>)
  }

  function handleCopy(event: ClipboardEvent<HTMLInputElement>) {
    onCopy?.(event)
    if (event.defaultPrevented) {
      return
    }
    if (props.type !== 'password') {
      return
    }
    const input = event.currentTarget
    const value = String(props.value ?? input.value ?? '')
    const start = input.selectionStart
    const end = input.selectionEnd
    const text = start != null && end != null && start !== end ? value.slice(start, end) : value
    if (!text) {
      return
    }
    event.clipboardData.setData('text/plain', text)
    event.preventDefault()
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    onPaste?.(event)
    if (event.defaultPrevented || props.disabled || props.readOnly) {
      return
    }
    const pasted = event.clipboardData.getData('text')
    if (!pasted) {
      return
    }
    event.preventDefault()
    const input = event.currentTarget
    const current = String(props.value ?? input.value ?? '')
    const start = input.selectionStart ?? current.length
    const end = input.selectionEnd ?? current.length
    let next = `${current.slice(0, start)}${pasted}${current.slice(end)}`
    if (typeof props.maxLength === 'number' && props.maxLength >= 0) {
      next = next.slice(0, props.maxLength)
    }
    emitChange(input, next)
  }

  return (
    <input
      className={classes}
      {...props}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onChange={onChange}
    />
  )
}
