import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'
import { ReasoningMode } from '../types'

const MODES: { value: ReasoningMode; labelKey: string; icon: string }[] = [
  { value: 'instant', labelKey: 'reasoning.instant', icon: '⚡' },
  { value: 'thinking', labelKey: 'reasoning.thinking', icon: '🧠' },
]

export function ReasoningToggle() {
  const { t } = useTranslation(['messages', 'common'])
  const { isLoading, isChangesLoading, correctionLevel, setOutputText, setChanges, setThinkingText } =
    useAppStore()
  const { reasoningMode, setReasoningMode, reasoningModel, ollamaHost } = useSettingsStore()
  const [canThink, setCanThink] = useState<boolean | null>(null)

  // Ollama rejects a thinking request outright on a model without the
  // capability, so the control has to know before it is offered.
  useEffect(() => {
    let active = true
    setCanThink(null)
    ollamaClient.setBaseUrl(ollamaHost)
    ollamaClient
      .supportsThinking(reasoningModel)
      .then((supported) => {
        if (active) setCanThink(supported)
      })
      .catch(() => {
        if (active) setCanThink(false)
      })
    return () => {
      active = false
    }
  }, [reasoningModel, ollamaHost])

  const handleSelect = (mode: ReasoningMode) => {
    if (mode === reasoningMode) return
    setReasoningMode(mode)
    // A result carries the mode that produced it, so switching invalidates it
    // rather than leaving a fast answer labelled as a reasoned one.
    setOutputText('')
    setChanges([])
    setThinkingText('')
  }

  const busy = isLoading || isChangesLoading
  // A mechanical fix pass does not use reasoning, so the control reflects the
  // mode that will actually run rather than the stored preference.
  const levelBlocks = correctionLevel === 'fix'
  const effectiveMode = levelBlocks ? 'instant' : reasoningMode

  return (
    <div className="segmented-control" role="group" aria-label={t('messages:reasoning.label')}>
      {MODES.map(({ value, labelKey, icon }) => {
        const unsupported =
          value === 'thinking' && (canThink === false || levelBlocks)
        return (
          <button
            key={value}
            onClick={() => handleSelect(value)}
            disabled={busy || unsupported || (value === 'thinking' && canThink === null)}
            aria-pressed={effectiveMode === value}
            title={
              unsupported
                ? levelBlocks
                  ? t('messages:reasoning.notForFix')
                  : t('messages:reasoning.unsupported', { model: reasoningModel })
                : t(`messages:${labelKey}`)
            }
            className={`segmented-control-item ${effectiveMode === value ? 'active' : ''}`}
          >
            <span aria-hidden="true">{icon}</span> {t(`messages:${labelKey}`)}
          </button>
        )
      })}
    </div>
  )
}
