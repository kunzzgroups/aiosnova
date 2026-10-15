import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { IconPaperclip } from '@/components/icons/Icons'
import './FileDropZone.css'

export type FileDropRejectReason =
  | 'empty'
  | 'too-large'
  | 'unsupported'
  | 'duplicate'
  | 'too-many'

export type FileDropRejectedFile = {
  file: File
  reason: FileDropRejectReason
}

type FileDropZoneProps = {
  value: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  hint?: string
  accept?: string
  /** Allow more than one file. Default false. */
  multiple?: boolean
  /** Optional per-file size limit. */
  maxSizeBytes?: number
  /** Optional total file-count limit when `multiple` is true. */
  maxFiles?: number
  /** Optional hook for caller-specific toast/error handling. */
  onReject?: (rejected: FileDropRejectedFile[]) => void
}

function fileKey(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true

  const rules = accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean)

  if (rules.length === 0) return true

  const name = file.name.toLowerCase()
  const mime = file.type.toLowerCase()

  return rules.some((rule) => {
    if (rule.startsWith('.')) {
      return name.endsWith(rule)
    }

    if (rule.endsWith('/*')) {
      return mime.startsWith(rule.slice(0, -1))
    }

    return mime === rule
  })
}

/**
 * Drag-and-drop + click-to-select + paste.
 *
 * All entry paths use the same validation pipeline, so `accept`, size limits,
 * duplicate handling, and file-count limits behave consistently for:
 * - OS picker
 * - drag/drop
 * - clipboard paste
 *
 * The file list is intentionally OUTSIDE the <label>. This avoids placing the
 * remove <button> inside a label, which is awkward interactive HTML and can
 * accidentally reopen the OS picker.
 */
export function FileDropZone({
  value,
  onChange,
  disabled = false,
  hint,
  accept,
  multiple = false,
  maxSizeBytes,
  maxFiles,
  onReject,
}: FileDropZoneProps) {
  const { t } = useTranslation()
  const generatedId = useId()
  const inputId = `file-drop-${generatedId}`

  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

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

  const existingKeys = useMemo(
    () => new Set(value.map(fileKey)),
    [value],
  )

  const validateAndAdd = useCallback(
    (incoming: File[]) => {
      if (disabled || incoming.length === 0) return

      const rejected: FileDropRejectedFile[] = []
      const accepted: File[] = []
      const seen = new Set(existingKeys)

      for (const file of incoming) {
        if (file.size <= 0) {
          rejected.push({ file, reason: 'empty' })
          continue
        }

        if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
          rejected.push({ file, reason: 'too-large' })
          continue
        }

        if (!matchesAccept(file, accept)) {
          rejected.push({ file, reason: 'unsupported' })
          continue
        }

        const key = fileKey(file)
        if (seen.has(key)) {
          rejected.push({ file, reason: 'duplicate' })
          continue
        }

        seen.add(key)
        accepted.push(file)

        if (!multiple) break
      }

      let next = multiple ? [...value, ...accepted] : accepted.slice(0, 1)

      if (
        multiple &&
        maxFiles !== undefined &&
        next.length > maxFiles
      ) {
        const overflow = next.slice(maxFiles)
        rejected.push(
          ...overflow.map((file) => ({
            file,
            reason: 'too-many' as const,
          })),
        )
        next = next.slice(0, maxFiles)
      }

      if (accepted.length > 0) {
        onChange(next)
      }

      if (rejected.length > 0) {
        onReject?.(rejected)

        const firstReason = rejected[0].reason
        const message =
          firstReason === 'too-large'
            ? t(
                'common.fileTooLarge',
                'One or more files are larger than the allowed size.',
              )
            : firstReason === 'unsupported'
              ? t(
                  'common.fileUnsupported',
                  'One or more files are not a supported file type.',
                )
              : firstReason === 'duplicate'
                ? t(
                    'common.fileDuplicate',
                    'This file is already selected.',
                  )
                : firstReason === 'too-many'
                  ? t(
                      'common.fileTooMany',
                      'Too many files selected.',
                    )
                  : t(
                      'common.fileEmpty',
                      'Empty files cannot be uploaded.',
                    )

        setLocalError(message)
      } else {
        setLocalError(null)
      }
    },
    [
      accept,
      disabled,
      existingKeys,
      maxFiles,
      maxSizeBytes,
      multiple,
      onChange,
      onReject,
      t,
      value,
    ],
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

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (
        event.currentTarget.contains(
          event.relatedTarget as Node | null,
        )
      ) {
        return
      }

      setIsDragging(false)
    },
    [],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)

      validateAndAdd(
        Array.from(event.dataTransfer.files ?? []),
      )
    },
    [validateAndAdd],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return

      const files = Array.from(
        event.clipboardData?.files ?? [],
      )

      if (files.length > 0) {
        event.preventDefault()
        validateAndAdd(files)
      }
    },
    [disabled, validateAndAdd],
  )

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      validateAndAdd(Array.from(input.files ?? []))

      window.setTimeout(() => {
        input.value = ''
      }, 0)
    },
    [validateAndAdd],
  )

  const handleRootKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return

      // Paste already works when this wrapper has focus. Do not synthesize
      // picker clicks here: the actual label/input remains the browse control.
      if (event.key === 'Escape') {
        setIsDragging(false)
      }
    },
    [disabled],
  )

  function removeAt(index: number) {
    if (disabled) return

    setLocalError(null)
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
      onPaste={handlePaste}
      onKeyDown={handleRootKeyDown}
      aria-disabled={disabled}
    >
      <input
        id={inputId}
        className="file-drop__input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
      />

      {value.length === 0 ? (
        <label
          htmlFor={disabled ? undefined : inputId}
          className="file-drop__picker file-drop__picker--empty"
        >
          <span className="file-drop__empty-title">
            {t(
              'common.dropFileHere',
              'Drag files here from your desktop',
            )}
          </span>

          <span className="file-drop__empty-hint">
            {hint ??
              t(
                'common.fileDropOr',
                'Or click to browse · Or paste (Ctrl+V)',
              )}
          </span>

          <span className="file-drop__empty-hint file-drop__empty-hint--muted">
            {t(
              'common.cloudFileHint',
              'Cloud-only files (OneDrive, iCloud) must be synced to disk first.',
            )}
          </span>
        </label>
      ) : (
        <>
          <ul className="file-drop__list">
            {value.map((file, index) => (
              <li
                key={fileKey(file)}
                className="file-drop__file"
              >
                <IconPaperclip />

                <span
                  className="file-drop__file-name"
                  title={file.name}
                >
                  {file.name}
                </span>

                <span className="file-drop__file-size">
                  {formatBytes(file.size)}
                </span>

                <button
                  type="button"
                  className="file-drop__remove"
                  aria-label={t(
                    'common.removeFile',
                    'Remove {{name}}',
                    { name: file.name },
                  )}
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <label
            htmlFor={disabled ? undefined : inputId}
            className="file-drop__picker file-drop__picker--more"
          >
            {multiple
              ? `+ ${t(
                  'common.addMoreFiles',
                  'Add more files',
                )}`
              : t(
                  'common.replaceFile',
                  'Choose another file',
                )}
          </label>
        </>
      )}

      {localError ? (
        <p className="file-drop__error" role="status">
          {localError}
        </p>
      ) : null}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
