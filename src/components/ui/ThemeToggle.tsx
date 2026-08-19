import { IconButton } from '@/components/ui/IconButton'
import { IconMoon, IconSun } from '@/components/icons/Icons'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <IconButton label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
      {isDark ? <IconSun /> : <IconMoon />}
    </IconButton>
  )
}
