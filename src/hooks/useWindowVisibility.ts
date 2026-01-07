import { useState, useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

export interface UseWindowVisibilityReturn {
  isVisible: boolean
  isActive: boolean
}

/**
 * Hook to track window visibility state (lazy vs active mode)
 * - Lazy: Window closed/minimized to menu bar - releases audio resources
 * - Active: Window visible and focused - normal operation
 */
export function useWindowVisibility(): UseWindowVisibilityReturn {
  const [isVisible, setIsVisible] = useState(true)
  const [isActive, setIsActive] = useState(true)

  // Deactivate audio session when going to lazy mode
  const enterLazyMode = useCallback(() => {
    // Release audio session to prevent ducking while in menu bar
    invoke('deactivate_voice_session').catch(() => {})
  }, [])

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const unlisteners: (() => void)[] = []

    const setup = async () => {
      // Listen for window close (minimize to menu bar)
      const unlistenClose = await appWindow.onCloseRequested(() => {
        setIsVisible(false)
        setIsActive(false)
        enterLazyMode()
      })
      unlisteners.push(unlistenClose)

      // Listen for focus events
      const unlistenFocus = await appWindow.onFocusChanged(({ payload: focused }) => {
        setIsActive(focused)
        if (!focused) {
          // Window lost focus - could be going to lazy mode
          // Don't immediately deactivate, wait for visibility change
        }
      })
      unlisteners.push(unlistenFocus)

      // Listen for window show/hide via Tauri events
      const { listen } = await import('@tauri-apps/api/event')

      // Window becomes visible (user clicks menu bar icon)
      const unlistenShow = await listen('tauri://window-created', () => {
        setIsVisible(true)
        setIsActive(true)
      })
      unlisteners.push(unlistenShow)

      // Also listen to document visibility for browser-level detection
      const handleVisibilityChange = () => {
        const visible = document.visibilityState === 'visible'
        setIsVisible(visible)
        if (!visible) {
          enterLazyMode()
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      unlisteners.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange))

      // Window blur/focus at document level
      const handleWindowBlur = () => {
        setIsActive(false)
      }
      const handleWindowFocus = () => {
        setIsActive(true)
        setIsVisible(true)
      }
      window.addEventListener('blur', handleWindowBlur)
      window.addEventListener('focus', handleWindowFocus)
      unlisteners.push(() => {
        window.removeEventListener('blur', handleWindowBlur)
        window.removeEventListener('focus', handleWindowFocus)
      })
    }

    setup()

    return () => {
      unlisteners.forEach(unlisten => unlisten())
    }
  }, [enterLazyMode])

  return {
    isVisible,
    isActive,
  }
}
