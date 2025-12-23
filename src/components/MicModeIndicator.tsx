import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

type MicMode = 'standard' | 'voiceIsolation' | 'wideSpectrum' | 'unknown'

const MODE_LABELS: Record<MicMode, string> = {
  standard: 'Standard',
  voiceIsolation: 'Voice Isolation',
  wideSpectrum: 'Wide Spectrum',
  unknown: 'Unknown',
}

const MODE_COLORS: Record<MicMode, string> = {
  standard: 'var(--text-tertiary)',
  voiceIsolation: 'var(--success)',
  wideSpectrum: 'var(--warning)',
  unknown: 'var(--text-tertiary)',
}

interface MicModeIndicatorProps {
  isListening: boolean
}

export function MicModeIndicator({ isListening }: MicModeIndicatorProps) {
  const [micMode, setMicMode] = useState<MicMode>('unknown')
  const [isSupported, setIsSupported] = useState(false)

  // Check mic mode when listening starts/stops
  useEffect(() => {
    async function checkMicMode() {
      try {
        const supported = await invoke<boolean>('is_voice_isolation_supported')
        setIsSupported(supported)

        if (supported) {
          const mode = await invoke<string>('get_mic_mode')
          setMicMode(mode as MicMode)
        }
      } catch (e) {
        console.warn('Failed to check mic mode:', e)
      }
    }

    checkMicMode()

    // Poll while listening to catch mode changes
    if (isListening) {
      const interval = setInterval(checkMicMode, 2000)
      return () => clearInterval(interval)
    }
  }, [isListening])

  if (!isSupported) return null

  const isVoiceIsolation = micMode === 'voiceIsolation'

  return (
    <div
      className="mic-mode-indicator"
      style={{ '--mode-color': MODE_COLORS[micMode] } as React.CSSProperties}
      title={`Mic Mode: ${MODE_LABELS[micMode]}`}
    >
      <div className={`mic-mode-dot ${isVoiceIsolation ? 'active' : ''}`} />
      <span className="mic-mode-label">
        {isVoiceIsolation ? 'Voice Isolation' : 'Standard'}
      </span>
      {isVoiceIsolation && (
        <svg className="mic-mode-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  )
}
