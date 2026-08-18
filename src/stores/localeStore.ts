import { create } from 'zustand'

export type AppLocale = 'en' | 'zh-CN'
export const APP_LOCALE_OPTIONS: Array<{ value: AppLocale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文' },
]

const LOCALE_STORAGE_KEY = 'aios.locale'

function readInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'en'
  }
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  const supported = APP_LOCALE_OPTIONS.some((item) => item.value === saved)
  return supported ? (saved as AppLocale) : 'en'
}

type LocaleState = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readInitialLocale(),
  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    }
    set({ locale })
  },
}))
