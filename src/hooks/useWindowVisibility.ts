import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface UseWindowVisibilityReturn {
  isVisible: boolean
}

const runtimeHiddenListeners = new Set<() => void>()

/**
 * Report a window the app itself hid, such as after an auto-hide copy.
 *
 * Tauri raises no event for a hide the frontend requested, so without this the
 * app would keep believing it is visible and would never release the resources
 * a hidden window is supposed to give up.
 */
export function notifyWindowHiddenByRuntime(): void {
  for (const listener of [...runtimeHiddenListeners]) {
    listener()
  }
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
      // Listen for window close (minimize to menu bar).
      //
      // Preventing the default matters: Tauri's own wrapper destroys the window
      // in its default branch, and the Rust host already hides the window and
      // prevents the close itself. Leaving the default in place would issue a
      // destroy the app neither wants nor is permitted to perform.
      const unlistenClose = await appWindow.onCloseRequested((event) => {
        event.preventDefault()
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

    // Registered synchronously: a hide the app triggers during setup still has
    // to reach this instance.
    const handleRuntimeHidden = () => {
      setIsVisible(false)
    }
    runtimeHiddenListeners.add(handleRuntimeHidden)

    setup()

    return () => {
      cleanedUp = true
      runtimeHiddenListeners.delete(handleRuntimeHidden)
      while (unlisteners.length > 0) {
        unlisteners.pop()?.()
      }
    }
  }, [])

  return {
    isVisible,
  }
}
