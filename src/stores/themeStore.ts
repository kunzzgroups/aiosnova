import { create } from 'zustand'

export type AppTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'aios.theme'

export function applyTheme(theme: AppTheme) {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function readInitialTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'dark'
  }
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  return saved === 'light' ? 'light' : 'dark'
}

type ThemeState = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))
