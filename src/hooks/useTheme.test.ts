import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'
import { useSettingsStore } from '../stores/settingsStore'

describe('useTheme', () => {
  let addEventListenerMock: ReturnType<typeof vi.fn>
  let removeEventListenerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset store
    useSettingsStore.setState({ theme: 'system' })

    // Clear document classes
    document.documentElement.classList.remove('light', 'dark')

    // Mock matchMedia
    addEventListenerMock = vi.fn()
    removeEventListenerMock = vi.fn()

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false, // Default to light
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns theme from settings store', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
  })

  it('returns resolved theme as light when system prefers light', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('light')
  })

  it('returns resolved theme as dark when system prefers dark', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true, // Prefers dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('applies light class to document when theme is light', () => {
    useSettingsStore.setState({ theme: 'light' })
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies dark class to document when theme is dark', () => {
    useSettingsStore.setState({ theme: 'dark' })
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('uses system preference when theme is system', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true, // System prefers dark
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    useSettingsStore.setState({ theme: 'system' })
    const { result } = renderHook(() => useTheme())

    expect(result.current.resolvedTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('adds event listener for system preference changes', () => {
    renderHook(() => useTheme())
    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('removes event listener on unmount', () => {
    const { unmount } = renderHook(() => useTheme())
    unmount()
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('updates theme when store changes', () => {
    const { result, rerender } = renderHook(() => useTheme())

    expect(result.current.resolvedTheme).toBe('light')

    act(() => {
      useSettingsStore.setState({ theme: 'dark' })
    })
    rerender()

    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('responds to system preference change event', () => {
    let changeHandler: (() => void) | null = null
    let mockMatches = false

    // Create a mutable mock that can change matches value
    const mockMediaQuery = {
      get matches() {
        return mockMatches
      },
      addEventListener: vi.fn((event, handler) => {
        if (event === 'change') changeHandler = handler
      }),
      removeEventListener: vi.fn(),
    }

    window.matchMedia = vi.fn().mockReturnValue(mockMediaQuery)

    useSettingsStore.setState({ theme: 'system' })
    const { result } = renderHook(() => useTheme())

    expect(result.current.resolvedTheme).toBe('light')

    // Simulate system preference change to dark
    act(() => {
      mockMatches = true
      changeHandler?.()
    })

    // After the change event, the theme should update
    expect(result.current.resolvedTheme).toBe('dark')
  })
})
