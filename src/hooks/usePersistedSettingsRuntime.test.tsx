import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePersistedSettingsRuntime } from './usePersistedSettingsRuntime'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'

vi.mock('../i18n', () => ({
  changeLanguage: vi.fn(),
}))

const setAlwaysOnTop = vi.fn<(value: boolean) => Promise<void>>()

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setAlwaysOnTop,
    hide: vi.fn().mockResolvedValue(undefined),
  })),
}))

/** A promise whose settlement this test controls. */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // An unobserved rejection would fail the run before the hook handles it.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** Let queued microtasks (the serialized native queue) run to completion. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('usePersistedSettingsRuntime', () => {
  beforeEach(() => {
    localStorage.clear()
    setAlwaysOnTop.mockReset()
    setAlwaysOnTop.mockResolvedValue(undefined)
    useAppStore.setState({ targetLang: 'ja', targetLangOwner: 'default' })
    useSettingsStore.setState({ defaultTargetLang: 'ja', alwaysOnTop: false })
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('default target language', () => {
    it('applies the saved default on mount', async () => {
      useSettingsStore.setState({ defaultTargetLang: 'vi' })

      renderHook(() => usePersistedSettingsRuntime())

      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('vi')
      })
      expect(useAppStore.getState().targetLangOwner).toBe('default')
    })

    it('applies a persisted default restored from storage', async () => {
      localStorage.setItem(
        'tran-app-settings',
        JSON.stringify({ state: { defaultTargetLang: 'ko' }, version: 1 })
      )
      await useSettingsStore.persist.rehydrate()

      renderHook(() => usePersistedSettingsRuntime())

      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('ko')
      })
    })

    it('follows a default change while the target is still default-owned', async () => {
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('ja')
      })

      act(() => {
        useSettingsStore.getState().setDefaultTargetLang('vi')
      })

      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('vi')
      })
    })

    it('never overwrites a target language the user chose', async () => {
      renderHook(() => usePersistedSettingsRuntime())
      act(() => {
        useAppStore.getState().setTargetLang('en')
      })

      act(() => {
        useSettingsStore.getState().setDefaultTargetLang('vi')
      })
      await flush()

      expect(useAppStore.getState().targetLang).toBe('en')
    })

    it('reapplies the current default immediately after a reset', async () => {
      useSettingsStore.setState({ defaultTargetLang: 'vi' })
      renderHook(() => usePersistedSettingsRuntime())
      act(() => {
        useAppStore.getState().setTargetLang('en')
      })

      act(() => {
        useAppStore.getState().reset()
      })

      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('vi')
      })
      expect(useAppStore.getState().targetLangOwner).toBe('default')
    })

    it('survives a StrictMode remount without resurrecting the default', async () => {
      useSettingsStore.setState({ defaultTargetLang: 'vi' })
      const { unmount } = renderHook(() => usePersistedSettingsRuntime(), {
        wrapper: StrictMode,
      })
      await waitFor(() => {
        expect(useAppStore.getState().targetLang).toBe('vi')
      })

      act(() => {
        useAppStore.getState().setTargetLang('en')
      })
      unmount()
      renderHook(() => usePersistedSettingsRuntime(), { wrapper: StrictMode })
      await flush()

      expect(useAppStore.getState().targetLang).toBe('en')
      expect(useAppStore.getState().targetLangOwner).toBe('user')
    })
  })

  describe('always on top', () => {
    it('applies the saved value on startup', async () => {
      useSettingsStore.setState({ alwaysOnTop: true })

      renderHook(() => usePersistedSettingsRuntime())

      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })
    })

    it('applies a toggle from true to false', async () => {
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
      })

      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(false)
      })
    })

    it('reports a failure without discarding the saved preference', async () => {
      setAlwaysOnTop.mockRejectedValue(new Error('window manager refused'))
      useSettingsStore.setState({ alwaysOnTop: true })

      renderHook(() => usePersistedSettingsRuntime())

      await waitFor(() => {
        expect(
          useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError
        ).toContain('window manager refused')
      })
      expect(useSettingsStore.getState().alwaysOnTop).toBe(true)
    })

    it('clears the failure once the latest value applies', async () => {
      setAlwaysOnTop.mockRejectedValueOnce(new Error('window manager refused'))
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).not.toBeNull()
      })

      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
      })

      await waitFor(() => {
        expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
      })
      expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false)
    })

    it('ends at the latest desired value when an earlier call is still in flight', async () => {
      const pendingTrue = deferred()
      setAlwaysOnTop.mockReturnValueOnce(pendingTrue.promise)
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      // The user turns it off while the native call for `true` is still open.
      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
      })
      expect(setAlwaysOnTop).toHaveBeenCalledTimes(1)

      await act(async () => {
        pendingTrue.resolve()
        await pendingTrue.promise
      })
      await flush()

      expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false)
      expect(setAlwaysOnTop.mock.calls.map(([value]) => value)).toEqual([true, false])
    })

    it('does not let a stale rejection own the current status', async () => {
      const pendingTrue = deferred()
      setAlwaysOnTop.mockReturnValueOnce(pendingTrue.promise)
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
      })

      await act(async () => {
        pendingTrue.reject(new Error('stale failure'))
        await Promise.resolve()
      })
      await flush()

      expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
      expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false)
    })

    it('does not let a stale success clear a current failure', async () => {
      const pendingTrue = deferred()
      setAlwaysOnTop.mockReturnValueOnce(pendingTrue.promise)
      setAlwaysOnTop.mockRejectedValue(new Error('current failure'))
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
      })
      await act(async () => {
        pendingTrue.resolve()
        await pendingTrue.promise
      })
      await flush()

      expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toContain(
        'current failure'
      )
    })

    it('converges on the latest value across rapid toggles', async () => {
      const pendingTrue = deferred()
      setAlwaysOnTop.mockReturnValueOnce(pendingTrue.promise)
      useSettingsStore.setState({ alwaysOnTop: true })
      renderHook(() => usePersistedSettingsRuntime())
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      act(() => {
        useSettingsStore.getState().setAlwaysOnTop(false)
        useSettingsStore.getState().setAlwaysOnTop(true)
        useSettingsStore.getState().setAlwaysOnTop(false)
      })
      await act(async () => {
        pendingTrue.resolve()
        await pendingTrue.promise
      })
      await flush()

      expect(setAlwaysOnTop).toHaveBeenLastCalledWith(false)
      expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
    })

    it('does not report a failure that arrives after unmount', async () => {
      const pendingTrue = deferred()
      setAlwaysOnTop.mockReturnValue(pendingTrue.promise)
      useSettingsStore.setState({ alwaysOnTop: true })
      const { unmount } = renderHook(() => usePersistedSettingsRuntime(), {
        wrapper: StrictMode,
      })
      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })

      unmount()
      await act(async () => {
        pendingTrue.reject(new Error('late failure'))
        await Promise.resolve()
      })
      await flush()

      expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
    })

    it('still applies the desired value under StrictMode double mounting', async () => {
      useSettingsStore.setState({ alwaysOnTop: true })

      renderHook(() => usePersistedSettingsRuntime(), { wrapper: StrictMode })

      await waitFor(() => {
        expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
      })
      expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
    })
  })
})
