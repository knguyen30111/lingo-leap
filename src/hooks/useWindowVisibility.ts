import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
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
    let cleanedUp = false

    // Registration is asynchronous, so a subscription can land after cleanup
    // already ran. Release it immediately instead of storing it for nobody.
    const register = (unlisten: () => void) => {
      if (cleanedUp) {
        unlisten()
        return
      }
      unlisteners.push(unlisten)
    }

    const setup = async () => {
      // Listen for window close (minimize to menu bar)
      const unlistenClose = await appWindow.onCloseRequested(() => {
        setIsVisible(false)
      })
      register(unlistenClose)

      // Window becomes visible (user clicks menu bar icon)
      const unlistenShow = await listen('tauri://window-created', () => {
        setIsVisible(true)
      })
      register(unlistenShow)

      // Also listen to document visibility for browser-level detection
      const handleVisibilityChange = () => {
        setIsVisible(document.visibilityState === 'visible')
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      register(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

      // Window focus at document level
      const handleWindowFocus = () => {
        setIsVisible(true)
      }
      window.addEventListener('focus', handleWindowFocus)
      register(() => {
        window.removeEventListener('focus', handleWindowFocus)
      })
    }

    setup()

    return () => {
      cleanedUp = true
      while (unlisteners.length > 0) {
        unlisteners.pop()?.()
      }
    }
  }, [])

  return {
    isVisible,
  }
}
