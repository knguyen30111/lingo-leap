interface SpeechPreviewProps {
  isVisible: boolean
  transcript: string
  interimTranscript: string
}

export function SpeechPreview({ isVisible, transcript, interimTranscript }: SpeechPreviewProps) {
  const displayText = interimTranscript || transcript
  const isEmpty = !displayText
  const isFinal = Boolean(transcript && !interimTranscript)

  return (
    <div
      className={`speech-preview ${isVisible ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={`speech-preview-text ${isEmpty ? 'empty' : ''} ${isFinal ? 'final' : ''}`}>
        {displayText || 'Start speaking...'}
      </div>
      <div className="speech-preview-status">
        <span className="listening-dot" aria-hidden="true" />
        <span>Listening...</span>
        <span className="speech-preview-hint">Click mic to stop</span>
      </div>
    </div>
  )
}
