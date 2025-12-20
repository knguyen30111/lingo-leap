import { useEffect, useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function useTheme() {
  const { theme } = useSettingsStore()
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateTheme = () => {
      let effectiveTheme: 'light' | 'dark'

      if (theme === 'system') {
        effectiveTheme = mediaQuery.matches ? 'dark' : 'light'
      } else {
        effectiveTheme = theme
      }

      setResolvedTheme(effectiveTheme)

      // Apply class to document root
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(effectiveTheme)
    }

    // Initial update
    updateTheme()

    // Listen for system preference changes
    mediaQuery.addEventListener('change', updateTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateTheme)
    }
  }, [theme])

  return { theme, resolvedTheme }
}
