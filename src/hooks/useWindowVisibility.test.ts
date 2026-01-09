import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWindowVisibility } from './useWindowVisibility'

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
    } as ReturnType<typeof getCurrentWindow>)

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

  it('calls deactivate_voice_session on close request', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    act(() => {
      closeRequestedCallback?.()
    })

    expect(invoke).toHaveBeenCalledWith('deactivate_voice_session')
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

  it('calls deactivate_voice_session when document becomes hidden', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    renderHook(() => useWindowVisibility())

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('deactivate_voice_session')
    })
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

  it('handles deactivate_voice_session failure gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed'))

    const { result } = renderHook(() => useWindowVisibility())

    await waitFor(() => {
      expect(closeRequestedCallback).not.toBeNull()
    })

    // Should not throw
    act(() => {
      closeRequestedCallback?.()
    })

    expect(result.current.isVisible).toBe(false)
  })
})
