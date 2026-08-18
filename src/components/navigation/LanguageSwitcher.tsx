import { useEffect, useId, useRef, useState } from 'react'
import { APP_LOCALE_OPTIONS, type AppLocale, useLocaleStore } from '@/stores/localeStore'
import './LanguageSwitcher.css'

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3 12h18M12 3c2.5 2.8 3.8 6 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-6-3.8-9s1.3-6.2 3.8-9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <path d="M4 6.2 8 10l4-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LanguageSwitcher() {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = APP_LOCALE_OPTIONS.find((item) => item.value === locale) ?? APP_LOCALE_OPTIONS[0]!

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        type="button"
        className={['language-switcher__trigger', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Language"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="language-switcher__globe">
          <IconGlobe />
        </span>
        <span className="language-switcher__label">{selected.label}</span>
        <span className="language-switcher__chevron" aria-hidden>
          <IconChevron />
        </span>
      </button>

      {open ? (
        <ul className="language-switcher__menu" id={listId} role="listbox" aria-label="Language">
          {APP_LOCALE_OPTIONS.map((option) => {
            const selectedOption = option.value === locale
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  className={['language-switcher__option', selectedOption ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setLocale(option.value as AppLocale)
                    setOpen(false)
                  }}
                >
                  <span>{option.label}</span>
                  {selectedOption ? <span className="language-switcher__check" aria-hidden /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
