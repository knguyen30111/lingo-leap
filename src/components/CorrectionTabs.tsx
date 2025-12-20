import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useCorrection } from '../hooks/useCorrection'

export function CorrectionTabs() {
  const { correctionLevel, isLoading } = useAppStore()
  const { setLevel } = useCorrection()

  const levels: { value: CorrectionLevel; label: string; description: string }[] = [
    { value: 'fix', label: 'Fix', description: 'Grammar & spelling' },
    { value: 'improve', label: 'Improve', description: '+ Word choice' },
    { value: 'rewrite', label: 'Rewrite', description: 'Full rephrase' },
  ]

  return (
    <div className="segmented-control">
      {levels.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setLevel(value)}
          disabled={isLoading}
          className={`segmented-control-item ${correctionLevel === value ? 'active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
