import { useState, useEffect, useCallback, useRef } from 'react'

export interface AudioOutputDevice {
  deviceId: string
  label: string
  isDefault: boolean
}

export interface UseAudioOutputDevicesReturn {
  devices: AudioOutputDevice[]
  selectedDeviceId: string | null
  isLoading: boolean
  error: string | null
  selectDevice: (deviceId: string) => void
  refreshDevices: () => Promise<void>
  testSound: () => Promise<void>
  isTesting: boolean
}

// Test sound - short click/pop sound
const TEST_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQQAaLvt559NEjOr1PGjYB8JQZ3T7aFbFQxBl8/wqWYfDT+W0NelXhsJOI/L6qJcFQZJk8jlmlkQADqGv9+SSw0BMH+/aqt0Qk5UW0xDbElKW2dgVlxobnZzanl6f398eX19goOEhYeLjY+Qk5eZnJ+hpqmusbS5vcDDxcjLztHU1tnc3+Hi5Obs7/Hz9fb5+/z9/v4='

export function useAudioOutputDevices(): UseAudioOutputDevicesReturn {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Check if setSinkId is supported
  const isSinkIdSupported = typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype

  // Fetch available audio output devices
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('Device enumeration not supported')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioOutputs = allDevices
        .filter(device => device.kind === 'audiooutput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${index + 1}`,
          isDefault: device.deviceId === 'default' || index === 0,
        }))

      setDevices(audioOutputs)

      // Auto-select saved or default device (only if not already selected)
      setSelectedDeviceId(prev => {
        if (prev && audioOutputs.some(d => d.deviceId === prev)) {
          return prev // Keep current selection if valid
        }
        const savedDeviceId = localStorage.getItem('preferredSpeakerDeviceId')
        if (savedDeviceId && audioOutputs.some(d => d.deviceId === savedDeviceId)) {
          return savedDeviceId
        }
        return audioOutputs.length > 0 ? audioOutputs[0].deviceId : null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list devices')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Select a specific device
  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    localStorage.setItem('preferredSpeakerDeviceId', deviceId)
  }, [])

  // Play test sound through selected device
  const testSound = useCallback(async () => {
    if (!selectedDeviceId || isTesting) return

    setIsTesting(true)
    setError(null)

    try {
      // Create audio element if not exists
      if (!audioRef.current) {
        audioRef.current = new Audio(TEST_SOUND_URL)
      }

      const audio = audioRef.current

      // Set output device if supported
      if (isSinkIdSupported && selectedDeviceId !== 'default') {
        try {
          await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedDeviceId)
        } catch (sinkErr) {
          console.warn('Failed to set sink ID:', sinkErr)
        }
      }

      // Play the test sound
      audio.currentTime = 0
      await audio.play()

      // Wait for audio to finish
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        // Fallback timeout
        setTimeout(resolve, 1000)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to play test sound')
    } finally {
      setIsTesting(false)
    }
  }, [selectedDeviceId, isTesting, isSinkIdSupported])

  // Load devices on mount
  useEffect(() => {
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

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return {
    devices,
    selectedDeviceId,
    isLoading,
    error,
    selectDevice,
    refreshDevices,
    testSound,
    isTesting,
  }
}
