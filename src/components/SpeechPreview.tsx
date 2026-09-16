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
    // The panel is only faded out with opacity, so without aria-hidden it stays
    // in the accessibility tree and screen readers announce "Listening..." even
    // while the microphone is idle.
    <div
      className={`speech-preview ${isVisible ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={!isVisible}
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
