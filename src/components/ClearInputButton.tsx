interface ClearInputButtonProps {
  onClick: () => void
  visible: boolean
}

export function ClearInputButton({ onClick, visible }: ClearInputButtonProps) {
  if (!visible) return null

  return (
    <button
      onClick={onClick}
      className="clear-input-btn"
      title="Clear input"
      type="button"
      aria-label="Clear input text"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}
