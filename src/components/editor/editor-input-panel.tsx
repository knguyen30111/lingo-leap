import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSpeechToText } from '../../hooks/useSpeechToText'
import { MicButton } from '../MicButton'
import { SpeechPreview } from '../SpeechPreview'
import { ClearInputButton } from '../ClearInputButton'

const SPEECH_LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: 'JA' },
  { code: 'vi', label: 'VI' },
  { code: 'zh', label: 'ZH' },
  { code: 'ko', label: 'KO' },
]

interface EditorInputPanelProps {
  className: string
  header?: ReactNode
  value: string
  onChange: (text: string) => void
  onClear: () => void
  /** Invoked from the Cmd/Ctrl+Enter handler only. The empty-input guard stays in the view. */
  onSubmit: () => void
  placeholder: string
  speechDisabled: boolean
}

export function EditorInputPanel({
  className,
  header,
  value,
  onChange,
  onClear,
  onSubmit,
  placeholder,
  speechDisabled,
}: EditorInputPanelProps) {
  const { t } = useTranslation(['common', 'messages'])
  const { speechLang, setSpeechLang } = useSettingsStore()

  // Callback to append speech text to input. The current text is read from the store
  // rather than from `value`, because this callback is memoized and the prop it closed
  // over would be stale by the time a recognition result arrives.
  const handleTextReady = useCallback((text: string) => {
    const current = useAppStore.getState().inputText
    onChange(current ? current + ' ' + text : text)
  }, [onChange])

  // Speech-to-text hook with continuous mode
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    silenceDetected,
    error: speechError,
    toggleListening,
  } = useSpeechToText({
    lang: speechLang,
    onTextReady: handleTextReady,
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={className}>
      {header}
      <ClearInputButton
        onClick={onClear}
        visible={value.length > 0}
      />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="
              flex-1 p-4 pr-10 bg-transparent resize-none
              text-[var(--text-primary)] text-base leading-relaxed
              placeholder:text-[var(--text-tertiary)]
              focus:outline-none
            "
      />
      <div className="px-3 py-1.5 border-t border-[var(--border-color)] flex items-center justify-between">
        {/* Left: Mic button with language selector */}
        <div className="flex items-center">
          <div className="relative">
            <div className="button-group">
              <MicButton
                isListening={isListening}
                isSupported={isSupported}
                silenceDetected={silenceDetected}
                onClick={toggleListening}
                disabled={speechDisabled}
              />
              {isSupported && (
                <select
                  value={speechLang}
                  onChange={(e) => setSpeechLang(e.target.value)}
                  className="speech-lang-select"
                  title="Speech language"
                  aria-label="Speech language"
                >
                  {SPEECH_LANGS.map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              )}
            </div>
            <SpeechPreview
              isVisible={isListening}
              transcript={transcript}
              interimTranscript={interimTranscript}
            />
          </div>
          {/* A failed attempt stays retryable - report it next to the control */}
          {speechError && (
            <span role="alert" className="ml-2 text-[10px] text-[var(--error)]">
              {speechError}
            </span>
          )}
        </div>
        {/* Right: Char count */}
        <span className="text-[10px] text-[var(--text-tertiary)]">
          {value.length} {t('chars')}
        </span>
      </div>
    </div>
  )
}
