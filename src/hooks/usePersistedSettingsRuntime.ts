import { useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'

function reasonOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : `${fallback}: ${String(err)}`
}

/**
 * Applies the persisted desktop settings that need a runtime effect.
 *
 * Mounted once from the application root next to the other runtime owners, so
 * a saved preference reaches the window exactly once per change.
 */
export function usePersistedSettingsRuntime(): void {
  const defaultTargetLang = useSettingsStore((state) => state.defaultTargetLang)
  const targetLangOwner = useAppStore((state) => state.targetLangOwner)
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop)

  // The saved default seeds the request language, and reclaims it whenever
  // ownership returns to the default - a reset, for example.
  useEffect(() => {
    if (targetLangOwner !== 'default') return
    useAppStore.getState().applyDefaultTargetLang(defaultTargetLang)
  }, [defaultTargetLang, targetLangOwner])

  const desiredAlwaysOnTop = useRef(alwaysOnTop)
  const isApplying = useRef(false)
  const isMounted = useRef(true)

  useEffect(() => {
    desiredAlwaysOnTop.current = alwaysOnTop
    isMounted.current = true

    const applyUntilSettled = async () => {
      const status = useDesktopRuntimeStatusStore.getState()
      try {
        // Keep going until the value we just applied is still the wanted one.
        for (;;) {
          const applying = desiredAlwaysOnTop.current
          try {
            await getCurrentWindow().setAlwaysOnTop(applying)
            if (!isMounted.current) return
            if (desiredAlwaysOnTop.current === applying) {
              status.clearAlwaysOnTopApplyError()
              return
            }
          } catch (err) {
            if (!isMounted.current) return
            if (desiredAlwaysOnTop.current === applying) {
              // Stop here rather than retrying: the preference stays saved,
              // and the panel reports that the platform refused it.
              status.setAlwaysOnTopApplyError(
                reasonOf(err, 'Could not apply always on top')
              )
              return
            }
            // A failure for a value nobody wants any more owns nothing; the
            // next pass applies what is wanted now.
          }
        }
      } finally {
        isApplying.current = false
      }
    }

    // One native call at a time. A second `setAlwaysOnTop` racing the first
    // could land in either order, so the window would settle on whichever
    // reply arrived last rather than on what the user last asked for. The
    // running pass already picks up the value written above.
    if (!isApplying.current) {
      isApplying.current = true
      void applyUntilSettled()
    }

    return () => {
      isMounted.current = false
    }
  }, [alwaysOnTop])
}
