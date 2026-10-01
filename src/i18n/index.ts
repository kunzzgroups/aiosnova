import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_LOCALE_OPTIONS, type AppLocale, useLocaleStore } from '@/stores/localeStore'
import { en } from './locales/en'
import { zhCN } from './locales/zh-CN'

/**
 * Flat-key layout: every key is `area.subject` (e.g. `shell.workspace`,
 * `nav.customer-revenue.crm`, `auth.login.submit`). Keys are literal, so dots
 * never mean nesting - `keySeparator` is disabled on purpose, which keeps nav
 * ids usable verbatim as translation keys.
 *
 * English is the source language and the fallback. Navigation labels are the
 * one exception: their English text lives in `src/navigation/sidebarNav.ts`
 * (it also derives ids and paths) and is passed as `defaultValue`, so there is
 * no second copy to drift.
 */
export const i18n = i18next.createInstance()

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: readInitialLocale(),
  fallbackLng: 'en',
  supportedLngs: APP_LOCALE_OPTIONS.map((option) => option.value),
  defaultNS: 'translation',
  keySeparator: false,
  nsSeparator: ':',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

function readInitialLocale(): AppLocale {
  const stored = useLocaleStore.getState().locale
  return APP_LOCALE_OPTIONS.some((option) => option.value === stored) ? stored : 'en'
}

// The language switcher writes to the locale store; i18next follows it.
useLocaleStore.subscribe((state) => {
  if (state.locale !== i18n.resolvedLanguage) {
    void i18n.changeLanguage(state.locale)
  }
})
