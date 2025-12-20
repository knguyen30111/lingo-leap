import { useAppStore, Mode } from '../stores/appStore'

export function ModeSelector() {
  const { mode, setMode, isEnabled } = useAppStore()

  const modes: { value: Mode; label: string }[] = [
    { value: 'translate', label: 'Translate' },
    { value: 'correct', label: 'Correct' },
  ]

  return (
    <div className="segmented-control">
      {modes.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setMode(value)}
          disabled={!isEnabled}
          className={`segmented-control-item ${mode === value ? 'active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
