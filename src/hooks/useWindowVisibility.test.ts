import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWindowVisibility, notifyWindowHiddenByRuntime } from './useWindowVisibility'

// Mock Tauri APIs - must be hoisted
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
  })),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

describe('useWindowVisibility', () => {
  let closeRequestedCallback: (() => void) | null = null
  let windowCreatedCallback: (() => void) | null = null

  beforeEach(async () => {
    closeRequestedCallback = null
    windowCreatedCallback = null

    // Get mocked modules
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { listen } = await import('@tauri-apps/api/event')
    const { invoke } = await import('@tauri-apps/api/core')

    // Setup mock implementations
    vi.mocked(getCurrentWindow).mockReturnValue({
      onCloseRequested: vi.fn().mockImplementation((callback) => {
        closeRequestedCallback = callback
        return Promise.resolve(() => {})
      }),
    } as unknown as ReturnType<typeof getCurrentWindow>)

    vi.mocked(listen).mockImplementation((event, callback) => {
      if (event === 'tauri://window-created') {
        windowCreatedCallback = callback as () => void
      }
      return Promise.resolve(() => {})
    })

    vi.mocked(invoke).mockResolvedValue(undefined)

    // Reset document visibility
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns isVisible true by default', () => {
    const { result } = renderHook(() => useWindowVisibility())
    expect(result.current.isVisible).toBe(true)
  })

  it('sets isVisible false on close request', async () => {
    const { result } = renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      closeRequestedCallback?.()
    })

    expect(result.current.isVisible).toBe(false)
  })

  it('does not own the native voice session on close request', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      closeRequestedCallback?.()
    })

    expect(invoke).not.toHaveBeenCalled()
  })

  it('sets isVisible true on window created event', async () => {
    const { result } = renderHook(() => useWindowVisibility())

    // First trigger close to set visible to false
    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      closeRequestedCallback?.()
    })
    expect(result.current.isVisible).toBe(false)

    // Then trigger window created
    act(() => {
      windowCreatedCallback?.()
    })
    expect(result.current.isVisible).toBe(true)
  })

  it('responds to document visibility change', async () => {
    const { result } = renderHook(() => useWindowVisibility())

    // Wait for setup to complete
    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    // Simulate visibility change to hidden
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false)
    })
  })

  it('does not own the native voice session when the document becomes hidden', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { result } = renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false)
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('sets isVisible true on window focus', async () => {
    const { result } = renderHook(() => useWindowVisibility())

    // Wait for setup to complete
    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    // First set to not visible via visibility change
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false)
    })

    // Then trigger focus to restore visibility
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(result.current.isVisible).toBe(true)
    })
  })

  it('cleans up listeners on unmount', async () => {
    const removeVisibilityListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useWindowVisibility())

    // Wait for setup to complete
    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    unmount()

    expect(removeVisibilityListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })

  it('runs every listener cleanup registered after an early unmount', async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { listen } = await import('@tauri-apps/api/event')

    const unlistenClose = vi.fn()
    const unlistenCreated = vi.fn()
    let resolveClose: () => void = () => {}
    let resolveCreated: () => void = () => {}

    const closePending = new Promise<() => void>((resolve) => {
      resolveClose = () => resolve(unlistenClose)
    })
    const createdPending = new Promise<() => void>((resolve) => {
      resolveCreated = () => resolve(unlistenCreated)
    })

    vi.mocked(getCurrentWindow).mockReturnValue({
      onCloseRequested: vi.fn(() => closePending),
    } as unknown as ReturnType<typeof getCurrentWindow>)
    vi.mocked(listen).mockReturnValue(
      createdPending as unknown as ReturnType<typeof listen>
    )

    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useWindowVisibility())

    // Unmount before any registration resolves: every late unlistener still
    // has to run, or the native subscription leaks for the process lifetime.
    unmount()

    await act(async () => {
      resolveClose()
      resolveCreated()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(unlistenClose).toHaveBeenCalledTimes(1)
    expect(unlistenCreated).toHaveBeenCalledTimes(1)
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    )
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function))

    removeDocumentListener.mockRestore()
    removeWindowListener.mockRestore()
  })

  describe('runtime hide notification', () => {
    it('reports hidden when the runtime hides the window', async () => {
      const { result } = renderHook(() => useWindowVisibility())

      await waitFor(() => {
        expect(closeRequestedCallback).not.toBeNull()
      })

      act(() => {
        notifyWindowHiddenByRuntime()
      })

      expect(result.current.isVisible).toBe(false)
    })

    it('does not own the native voice session when the runtime hides the window', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const { result } = renderHook(() => useWindowVisibility())

      await waitFor(() => {
        expect(closeRequestedCallback).not.toBeNull()
      })

      act(() => {
        notifyWindowHiddenByRuntime()
      })

      expect(result.current.isVisible).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    })

    it('becomes visible again on focus after a runtime hide', async () => {
      const { result } = renderHook(() => useWindowVisibility())

      await waitFor(() => {
        expect(closeRequestedCallback).not.toBeNull()
      })

      act(() => {
        notifyWindowHiddenByRuntime()
      })
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      await waitFor(() => {
        expect(result.current.isVisible).toBe(true)
      })
    })

    it('stops reporting to an unmounted hook instance', async () => {
      const { result, unmount } = renderHook(() => useWindowVisibility())

      await waitFor(() => {
        expect(closeRequestedCallback).not.toBeNull()
      })

      unmount()

      expect(() => notifyWindowHiddenByRuntime()).not.toThrow()
      expect(result.current.isVisible).toBe(true)
    })
  })

  it('reports hidden only once per close request', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { result } = renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      closeRequestedCallback?.()
      closeRequestedCallback?.()
    })

    expect(result.current.isVisible).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
