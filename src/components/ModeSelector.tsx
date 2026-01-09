import { useTranslation } from 'react-i18next'
import { useAppStore, Mode } from '../stores/appStore'

export function ModeSelector() {
  const { t } = useTranslation('common')
  const { mode, setMode, isEnabled, isLoading, isChangesLoading } = useAppStore()

  const modes: { value: Mode; labelKey: string }[] = [
    { value: 'translate', labelKey: 'translate' },
    { value: 'correct', labelKey: 'correct' },
  ]

  const isDisabled = !isEnabled || isLoading || isChangesLoading

  return (
    <div className="segmented-control">
      {modes.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          disabled={isDisabled}
          className={`segmented-control-item ${mode === value ? 'active' : ''}`}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  )
}
