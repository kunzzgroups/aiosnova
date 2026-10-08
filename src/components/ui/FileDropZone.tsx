import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
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
 * Drag-and-drop + click-to-select + paste.
 *
 * The click path uses a <label htmlFor> linked to the hidden <input>. That is
 * the most reliable way to open the OS picker: no JS click simulation, and
 * every browser respects the label -> input association.
 *
 * The paste path reads the clipboard at the wrapper level and feeds the same
 * `addFiles` path, so all three entry points stay in lockstep.
 *
 * Dragging OUT of the OS "Open" dialog does not work — that dialog is modal,
 * so the browser never sees the drag. Use paste for that workflow.
 *
 * Cloud-only files (OneDrive, iCloud): Windows and macOS won't let the browser
 * read them until they're synced to disk. Dragging works (Explorer fetches
 * on demand); clicking "Open" does not. The hint text below says so.
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
  const generatedId = useId()
  const inputId = `file-drop-${generatedId}`

  const [isDragging, setIsDragging] = useState(false)

  /* Reset the drag hint when the window loses focus (e.g. an OS modal opens). */
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
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)
      if (disabled) return
      const files = Array.from(event.dataTransfer.files ?? [])
      addFiles(files)
    },
    [disabled, addFiles],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLLabelElement>) => {
      if (disabled) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        addFiles(files)
      }
    },
    [disabled, addFiles],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const files = Array.from(input.files ?? [])
      if (files.length > 0) addFiles(files)
      // Let the browser release the file handles, then clear so the same
      // file can be picked again. Deferred to avoid racing the change event.
      window.setTimeout(() => {
        input.value = ''
      }, 0)
    },
    [addFiles],
  )

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <label
      htmlFor={disabled ? undefined : inputId}
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
      onPaste={handlePaste}
      aria-disabled={disabled}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />

      {/* Either the empty hint, or the file list — one ternary covers both. */}
      {value.length === 0 ? (
        <div className="file-drop__empty">
          <span className="file-drop__empty-title">
            {t('common.dropFileHere', 'Drag files here from your desktop')}
          </span>
          <span className="file-drop__empty-hint">
            {hint ?? t('common.fileDropOr', 'Or click to browse · Or paste (Ctrl+V)')}
          </span>
          <span className="file-drop__empty-hint file-drop__empty-hint--muted">
            {t(
              'common.cloudFileHint',
              'Cloud-only files (OneDrive, iCloud) must be synced to disk first.',
            )}
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
                  // Stop the click from bubbling to the label, which would
                  // otherwise re-open the picker.
                  event.preventDefault()
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
    </label>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}