import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { IconPaperclip } from '@/components/icons/Icons'
import './FileDropZone.css'

type FileDropZoneProps = {
  value: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  hint?: string
  accept?: string
  /** Allow more than one file. Default false. */
  multiple?: boolean
}

/**
 * Drag-and-drop + click-to-select + paste. Renders the current file list.
 *
 * Three ways to hand it files:
 *   1. Drag from the DESKTOP or a File Explorer WINDOW onto the zone.
 *   2. Click the zone, pick inside the OS dialog, hit Open.
 *   3. Copy a file elsewhere (Ctrl+C) and paste here (Ctrl+V).
 *
 * Dragging OUT of the OS "Open" dialog does not work - that dialog is modal,
 * so the browser never sees the drag. Use paste for that workflow.
 *
 * Window blur / focus resets the drag state so the zone never sticks.
 */
export function FileDropZone({
  value,
  onChange,
  disabled = false,
  hint,
  accept,
  multiple = false,
}: FileDropZoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const justDroppedRef = useRef(false)

  useEffect(() => {
    function reset() {
      setIsDragging(false)
    }
    window.addEventListener('blur', reset)
    window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', reset)
    return () => {
      window.removeEventListener('blur', reset)
      window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [])

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return
      if (multiple) onChange([...value, ...incoming])
      else onChange([incoming[0]])
    },
    [multiple, onChange, value],
  )

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)
      if (disabled) return

      justDroppedRef.current = true
      window.setTimeout(() => {
        justDroppedRef.current = false
      }, 300)

      const files = Array.from(event.dataTransfer.files ?? [])
      addFiles(files)
    },
    [disabled, addFiles],
  )

  const handlePick = useCallback(() => {
    if (disabled) return
    if (justDroppedRef.current) return
    inputRef.current?.click()
  }, [disabled])

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handlePick()
      }
    },
    [handlePick],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      addFiles(files)
      event.target.value = ''
    },
    [addFiles],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        addFiles(files)
      }
    },
    [disabled, addFiles],
  )

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div
      className={[
        'file-drop',
        isDragging ? 'is-dragging' : '',
        disabled ? 'is-disabled' : '',
        value.length > 0 ? 'has-file' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handlePick}
      onKeyDown={handleKey}
      onPaste={handlePaste}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {value.length === 0 ? (
        <div className="file-drop__empty">
          <span className="file-drop__empty-title">
            {t('common.dropFileHere', 'Drag files here from your desktop')}
          </span>
          <span className="file-drop__empty-hint">
            {hint ?? t('common.fileDropOr', 'Or click to browse · Or paste (Ctrl+V)')}
          </span>
        </div>
      ) : (
        <ul className="file-drop__list">
          {value.map((file, index) => (
            <li key={`${file.name}-${index}`} className="file-drop__file">
              <IconPaperclip />
              <span className="file-drop__file-name" title={file.name}>
                {file.name}
              </span>
              <span className="file-drop__file-size">{formatBytes(file.size)}</span>
              <button
                type="button"
                className="file-drop__remove"
                aria-label={t('common.remove', 'Remove')}
                onClick={(event) => {
                  event.stopPropagation()
                  removeAt(index)
                }}
              >
                ×
              </button>
            </li>
          ))}
          {multiple ? (
            <li className="file-drop__add-more">
              + {t('common.addMoreFiles', 'Add more files')}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}