import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'

/**
 * Collapsible view of the model's reasoning pass.
 *
 * The reasoning is long and arrives before the answer, so it stays collapsed by
 * default: visible enough to inspect, never competing with the corrected text.
 */
export function ReasoningPanel() {
  const { t } = useTranslation('messages')
  const { thinkingText, isThinking } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  if (!thinkingText && !isThinking) return null

  return (
    <div className="border-t border-[var(--border-color)]">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
      >
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span aria-hidden="true">🧠</span>
        <span>{isThinking ? t('reasoning.thinkingNow') : t('reasoning.trace')}</span>
        {isThinking && (
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-blue)] opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--accent-blue)]" />
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 max-h-48 overflow-auto">
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--text-tertiary)]">
            {thinkingText || t('reasoning.waiting')}
          </p>
        </div>
      )}
    </div>
  )
}
