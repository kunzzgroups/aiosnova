import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import './KeyValueEditor.css'

export type KeyValuePair = { key: string; value: string }

type KeyValueEditorProps = {
  items: KeyValuePair[]
  onChange: (items: KeyValuePair[]) => void
  disabled?: boolean
  keyPlaceholder?: string
  valuePlaceholder?: string
  /** Label for the "add row" button. */
  addLabel?: string
}

/**
 * Small key/value table. Replaces raw-JSON textareas: users add rows, pick
 * names and values, and the caller converts to a plain object.
 *
 * Empty keys are dropped on blur so the schema stays clean.
 */
export function KeyValueEditor({
  items,
  onChange,
  disabled = false,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
}: KeyValueEditorProps) {
  const { t } = useTranslation()

  function update(index: number, patch: Partial<KeyValuePair>) {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    onChange(next)
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...items, { key: '', value: '' }])
  }

  return (
    <div className="kv-editor">
      {items.length === 0 ? (
        <p className="kv-editor__empty">
          {t('common.kvEmpty', 'No fields yet.')}
        </p>
      ) : (
        <ul className="kv-editor__list">
          {items.map((item, index) => (
            <li className="kv-editor__row" key={index}>
              <TextField
                className="kv-editor__key"
                value={item.key}
                onChange={(event) => update(index, { key: event.target.value })}
                placeholder={keyPlaceholder ?? t('common.kvKey', 'key')}
                disabled={disabled}
                autoComplete="off"
              />
              <TextField
                className="kv-editor__value"
                value={item.value}
                onChange={(event) => update(index, { value: event.target.value })}
                placeholder={valuePlaceholder ?? t('common.kvValue', 'value')}
                disabled={disabled}
                autoComplete="off"
              />
              <button
                type="button"
                className="kv-editor__remove"
                aria-label={t('common.remove', 'Remove')}
                disabled={disabled}
                onClick={() => remove(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={add}
        disabled={disabled}
      >
        + {addLabel ?? t('common.kvAdd', 'Add field')}
      </Button>
    </div>
  )
}

/** Convert editor rows into the plain string map the services expect. */
export function keyValuePairsToObject(items: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of items) {
    const key = item.key.trim()
    if (key) {
      out[key] = item.value
    }
  }
  return out
}