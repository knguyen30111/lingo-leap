import { useState, useEffect, useCallback } from 'react'

export interface AudioDevice {
  deviceId: string
  label: string
  isDefault: boolean
}

export interface UseAudioDevicesReturn {
  devices: AudioDevice[]
  selectedDeviceId: string | null
  isLoading: boolean
  error: string | null
  selectDevice: (deviceId: string) => Promise<void>
  refreshDevices: (requestPermission?: boolean) => Promise<void>
}

export function useAudioDevices(): UseAudioDevicesReturn {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch available audio input devices (lazy - doesn't request permission)
  const refreshDevices = useCallback(async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('Device enumeration not supported')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Only request permission if explicitly asked (e.g., user clicked dropdown)
      // This prevents interrupting TTS when Settings panel opens
      if (requestPermission) {
        await navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(track => track.stop()))
          .catch(() => {/* Ignore if already granted */})
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices
        .filter(device => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
          isDefault: device.deviceId === 'default' || index === 0,
        }))

      setDevices(audioInputs)

      // Auto-select first device if none selected
      if (!selectedDeviceId && audioInputs.length > 0) {
        setSelectedDeviceId(audioInputs[0].deviceId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list devices')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDeviceId])

  // Select a specific device
  const selectDevice = useCallback(async (deviceId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Request access to the specific device to "prime" it
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      })
      // Stop the stream immediately - we just needed to prime the device
      stream.getTracks().forEach(track => track.stop())

      setSelectedDeviceId(deviceId)

      // Save preference
      localStorage.setItem('preferredMicDeviceId', deviceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select device')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load saved preference and fetch devices on mount
  useEffect(() => {
    const savedDeviceId = localStorage.getItem('preferredMicDeviceId')
    if (savedDeviceId) {
      setSelectedDeviceId(savedDeviceId)
    }
    refreshDevices()
  }, [refreshDevices])

  // Listen for device changes
  useEffect(() => {
    const handleDeviceChange = () => {
      refreshDevices()
    }

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [refreshDevices])

  return {
    devices,
    selectedDeviceId,
    isLoading,
    error,
    selectDevice,
    refreshDevices,
  }
}
