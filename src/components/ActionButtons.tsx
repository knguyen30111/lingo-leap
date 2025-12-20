import { useState } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useAppStore } from '../stores/appStore'

export function ActionButtons() {
  const { outputText, isLoading } = useAppStore()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!outputText) return

    try {
      await writeText(outputText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const disabled = !outputText || isLoading

  return (
    <div className="flex items-center gap-2">
      {/* Copy Button - Glass Style */}
      <button
        onClick={handleCopy}
        disabled={disabled}
        className={`
          glass-button flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold
          ${copied
            ? 'bg-[var(--success)] text-white border-[var(--success)]'
            : ''
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {copied ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[var(--text-primary)]">Copy</span>
          </>
        )}
      </button>
    </div>
  )
}
