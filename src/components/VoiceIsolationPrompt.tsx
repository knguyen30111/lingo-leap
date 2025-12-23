import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settingsStore'

interface VoiceIsolationPromptProps {
  isVisible: boolean
  onDismiss: () => void
}

export function VoiceIsolationPrompt({ isVisible, onDismiss }: VoiceIsolationPromptProps) {
  const [micMode, setMicMode] = useState<string>('unknown')
  const [isSupported, setIsSupported] = useState(false)
  const { voiceIsolationPromptDismissed, setVoiceIsolationPromptDismissed } = useSettingsStore()

  // Check Voice Isolation support and current mode
  useEffect(() => {
    async function checkVoiceIsolation() {
      try {
        const supported = await invoke<boolean>('is_voice_isolation_supported')
        setIsSupported(supported)

        if (supported) {
          const mode = await invoke<string>('get_mic_mode')
          setMicMode(mode)
        }
      } catch (e) {
        console.warn('Failed to check voice isolation:', e)
      }
    }

    if (isVisible) {
      checkVoiceIsolation()
    }
  }, [isVisible])

  // Don't show if already dismissed, not supported, or already enabled
  if (!isVisible || voiceIsolationPromptDismissed || !isSupported || micMode === 'voiceIsolation') {
    return null
  }

  const handleEnable = async () => {
    try {
      await invoke('show_mic_mode_picker')
    } catch (e) {
      console.warn('Failed to show mic mode picker:', e)
    }
    setVoiceIsolationPromptDismissed(true)
    onDismiss()
  }

  const handleDismiss = () => {
    setVoiceIsolationPromptDismissed(true)
    onDismiss()
  }

  return (
    <div className="voice-isolation-prompt">
      <div className="voice-isolation-prompt-content">
        <div className="voice-isolation-prompt-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <circle cx="12" cy="12" r="10" strokeDasharray="4 4" opacity="0.5" />
          </svg>
        </div>
        <div className="voice-isolation-prompt-text">
          <strong>Noisy environment?</strong>
          <span>Enable Voice Isolation for clearer speech recognition</span>
        </div>
      </div>
      <div className="voice-isolation-prompt-actions">
        <button onClick={handleDismiss} className="voice-isolation-btn-dismiss">
          Dismiss
        </button>
        <button onClick={handleEnable} className="voice-isolation-btn-enable">
          Enable
        </button>
      </div>
    </div>
  )
}
