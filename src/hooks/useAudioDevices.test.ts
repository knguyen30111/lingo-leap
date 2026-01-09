import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAudioDevices } from './useAudioDevices'

describe('useAudioDevices', () => {
  const mockDevices: MediaDeviceInfo[] = [
    { deviceId: 'default', kind: 'audioinput', label: 'Default Mic', groupId: '1', toJSON: () => ({}) },
    { deviceId: 'mic1', kind: 'audioinput', label: 'USB Microphone', groupId: '2', toJSON: () => ({}) },
    { deviceId: 'speaker1', kind: 'audiooutput', label: 'Speakers', groupId: '3', toJSON: () => ({}) },
  ]

  let enumerateDevicesMock: ReturnType<typeof vi.fn>
  let getUserMediaMock: ReturnType<typeof vi.fn>
  let addEventListenerMock: ReturnType<typeof vi.fn>
  let removeEventListenerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()

    enumerateDevicesMock = vi.fn().mockResolvedValue(mockDevices)
    getUserMediaMock = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })
    addEventListenerMock = vi.fn()
    removeEventListenerMock = vi.fn()

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: enumerateDevicesMock,
        getUserMedia: getUserMediaMock,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial state and triggers loading', async () => {
    const { result } = renderHook(() => useAudioDevices())

    // Initially starts loading because useEffect triggers refreshDevices
    expect(result.current.devices).toEqual([])
    expect(result.current.selectedDeviceId).toBeNull()
    expect(result.current.error).toBeNull()

    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('enumerates devices on mount', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    expect(enumerateDevicesMock).toHaveBeenCalled()
    expect(result.current.devices).toHaveLength(2) // Only audio inputs
  })

  it('filters only audio input devices', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBe(2)
    })

    const deviceKinds = result.current.devices.map(d => d.label)
    expect(deviceKinds).toContain('Default Mic')
    expect(deviceKinds).toContain('USB Microphone')
    expect(deviceKinds).not.toContain('Speakers')
  })

  it('auto-selects first device', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.selectedDeviceId).toBe('default')
    })
  })

  it('loads saved device preference from localStorage', async () => {
    localStorage.setItem('preferredMicDeviceId', 'mic1')

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.selectedDeviceId).toBe('mic1')
    })
  })

  it('selects a device', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await result.current.selectDevice('mic1')
    })

    expect(result.current.selectedDeviceId).toBe('mic1')
    expect(localStorage.getItem('preferredMicDeviceId')).toBe('mic1')
  })

  it('requests specific device when selecting', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await result.current.selectDevice('mic1')
    })

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic1' } },
    })
  })

  it('handles select device error', async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error('Permission denied'))

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await result.current.selectDevice('mic1')
    })

    expect(result.current.error).toBe('Permission denied')
  })

  it('refreshes devices manually', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    enumerateDevicesMock.mockClear()

    await act(async () => {
      await result.current.refreshDevices()
    })

    expect(enumerateDevicesMock).toHaveBeenCalled()
  })

  it('requests permission when refreshing with requestPermission=true', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    getUserMediaMock.mockClear()

    await act(async () => {
      await result.current.refreshDevices(true)
    })

    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true })
  })

  it('handles permission request failure gracefully', async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error('Already granted'))

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    // Should not throw
    await act(async () => {
      await result.current.refreshDevices(true)
    })

    expect(result.current.error).toBeNull()
  })

  it('handles enumeration not supported', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useAudioDevices())

    await act(async () => {
      await result.current.refreshDevices()
    })

    expect(result.current.error).toBe('Device enumeration not supported')
  })

  it('listens for device changes', async () => {
    renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalledWith('devicechange', expect.any(Function))
    })
  })

  it('removes device change listener on unmount', async () => {
    const { unmount } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(addEventListenerMock).toHaveBeenCalled()
    })

    unmount()

    expect(removeEventListenerMock).toHaveBeenCalledWith('devicechange', expect.any(Function))
  })

  it('refreshes on device change event', async () => {
    let deviceChangeHandler: (() => void) | null = null
    addEventListenerMock.mockImplementation((event, handler) => {
      if (event === 'devicechange') deviceChangeHandler = handler
    })

    renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(deviceChangeHandler).not.toBeNull()
    })

    enumerateDevicesMock.mockClear()

    act(() => {
      deviceChangeHandler?.()
    })

    await waitFor(() => {
      expect(enumerateDevicesMock).toHaveBeenCalled()
    })
  })

  it('handles enumeration error', async () => {
    enumerateDevicesMock.mockRejectedValueOnce(new Error('Enumeration failed'))

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.error).toBe('Enumeration failed')
    })
  })

  it('sets isLoading during operations', async () => {
    let resolveEnumerate: (value: MediaDeviceInfo[]) => void
    enumerateDevicesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEnumerate = resolve
      })
    )

    const { result } = renderHook(() => useAudioDevices())

    // Initially not loading, then loading starts
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })

    await act(async () => {
      resolveEnumerate!(mockDevices)
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('marks default device', async () => {
    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    const defaultDevice = result.current.devices.find(d => d.deviceId === 'default')
    expect(defaultDevice?.isDefault).toBe(true)
  })

  it('provides fallback label for unlabeled devices', async () => {
    // Reset the mock to return only unlabeled device
    enumerateDevicesMock.mockReset()
    enumerateDevicesMock.mockResolvedValue([
      { deviceId: 'unlabeled', kind: 'audioinput', label: '', groupId: '1', toJSON: () => ({}) },
    ])

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBe(1)
    })

    expect(result.current.devices[0].label).toBe('Microphone 1')
  })

  it('handles non-Error thrown during enumeration', async () => {
    enumerateDevicesMock.mockRejectedValueOnce('String error')

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to list devices')
    })
  })

  it('handles non-Error thrown during device selection', async () => {
    getUserMediaMock.mockRejectedValueOnce('String error')

    const { result } = renderHook(() => useAudioDevices())

    await waitFor(() => {
      expect(result.current.devices.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await result.current.selectDevice('mic1')
    })

    expect(result.current.error).toBe('Failed to select device')
  })
})
