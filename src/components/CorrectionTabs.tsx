import { useTranslation } from 'react-i18next'
import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useCorrection } from '../hooks/useCorrection'

export function CorrectionTabs() {
  const { t } = useTranslation('messages')
  const { correctionLevel, isLoading } = useAppStore()
  const { setLevel } = useCorrection()

  const levels: { value: CorrectionLevel; labelKey: string }[] = [
    { value: 'fix', labelKey: 'correction.fix' },
    { value: 'improve', labelKey: 'correction.improve' },
    { value: 'rewrite', labelKey: 'correction.rewrite' },
  ]

  return (
    <div className="segmented-control">
      {levels.map(({ value, labelKey }) => (
        <button
          key={value}
          onClick={() => setLevel(value)}
          disabled={isLoading}
          className={`segmented-control-item ${correctionLevel === value ? 'active' : ''}`}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  )
}
