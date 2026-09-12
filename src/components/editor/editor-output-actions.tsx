import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyOutput } from '../../lib/copy-output'

interface EditorOutputActionsProps {
  isLoading: boolean
  loadingLabel: string
  outputText: string
  /** The view's own handler; drives both the regenerate and the submit button, as today. */
  onRegenerate: () => void
  regenerateLabel: string
  submitLabel: string
  submitTitle: string
  submitDisabled: boolean
}

export function EditorOutputActions({
  isLoading,
  loadingLabel,
  outputText,
  onRegenerate,
  regenerateLabel,
  submitLabel,
  submitTitle,
  submitDisabled,
}: EditorOutputActionsProps) {
  const { t } = useTranslation(['common', 'messages'])
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!outputText) return
    const result = await copyOutput(outputText)
    if (!result.copied) {
      console.error('Failed to copy:', result.copyError)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="px-3 py-2 border-t border-[var(--border-color)] flex items-center justify-between">
      {isLoading ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-blue)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-blue)]"></span>
            </span>
            <span className="text-xs text-[var(--accent-blue)]">{loadingLabel}</span>
          </div>
          <div />
        </>
      ) : outputText ? (
        <>
          <div className="flex items-center gap-1.5 text-[var(--success)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs">{t('done')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-md transition-colors"
              title={regenerateLabel}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{regenerateLabel}</span>
            </button>
            {/* One <button> whose children change with `copied`. Giving the two states
                distinct keys, or making one a different component type, would make React
                remount it and silently drop keyboard focus while the markup stayed
                byte-identical. The focus test in this module's suite is that guard. */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-md transition-colors ${
                copied
                  ? 'text-[var(--success)] border-[var(--success)] bg-[var(--success)]/10'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border-[var(--border-color)]'
              }`}
              title={t('copy')}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t('copied')}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{t('copy')}</span>
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <div />
          <button
            onClick={onRegenerate}
            disabled={submitDisabled}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={submitTitle}
          >
            {submitLabel}
          </button>
        </>
      )}
    </div>
  )
}
