import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface UseWindowVisibilityReturn {
  isVisible: boolean
}

/**
 * Hook to track window visibility state (lazy vs active mode)
 * - Lazy: Window closed/minimized to menu bar - releases audio resources
 * - Active: Window visible and focused - normal operation
 *
 * This hook reports visibility only. Releasing the native voice session is
 * owned by useSpeechToText, so a hidden window reaches that cleanup once.
 */
export function useWindowVisibility(): UseWindowVisibilityReturn {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const unlisteners: (() => void)[] = []

    const setup = async () => {
      // Listen for window close (minimize to menu bar)
      const unlistenClose = await appWindow.onCloseRequested(() => {
        setIsVisible(false)
      })
      unlisteners.push(unlistenClose)

      // Listen for window show/hide via Tauri events
      const { listen } = await import('@tauri-apps/api/event')

      // Window becomes visible (user clicks menu bar icon)
      const unlistenShow = await listen('tauri://window-created', () => {
        setIsVisible(true)
      })
      unlisteners.push(unlistenShow)

      // Also listen to document visibility for browser-level detection
      const handleVisibilityChange = () => {
        setIsVisible(document.visibilityState === 'visible')
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      unlisteners.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

      // Window focus at document level
      const handleWindowFocus = () => {
        setIsVisible(true)
      }
      window.addEventListener('focus', handleWindowFocus)
      unlisteners.push(() => {
        window.removeEventListener('focus', handleWindowFocus)
      })
    }

    setup()

    return () => {
      unlisteners.forEach(unlisten => unlisten())
    }
  }, [])

  return {
    isVisible,
  }
}
