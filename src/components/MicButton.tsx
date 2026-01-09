import { useTranslation } from 'react-i18next'

interface MicButtonProps {
  isListening: boolean
  isSupported: boolean
  silenceDetected?: boolean
  onClick: () => void
  disabled?: boolean
}

export function MicButton({ isListening, isSupported, silenceDetected, onClick, disabled }: MicButtonProps) {
  const { t } = useTranslation('common')

  if (!isSupported) return null

  const classes = [
    'mic-button',
    isListening ? 'listening' : '',
    silenceDetected ? 'silence-detected' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classes}
      title={isListening ? t('stopListening') : t('voiceInput')}
      aria-pressed={isListening}
      aria-label={isListening ? t('stopListening') : t('voiceInput')}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  )
}
