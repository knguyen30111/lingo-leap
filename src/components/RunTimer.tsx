import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  return `${mins}m ${Math.round(seconds % 60)}s`
}

/**
 * Elapsed time for the current or last correction run.
 *
 * A reasoning run can take a minute on a local model, which is long enough that
 * a static spinner reads as a hang. Counting up while it works shows the wait is
 * progressing, and the final figure lets the user judge what Thinking costs
 * against what it bought them.
 */
export function RunTimer() {
  const { isLoading, runStartedAt, lastRunMs } = useAppStore()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isLoading || runStartedAt === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [isLoading, runStartedAt])

  if (isLoading && runStartedAt !== null) {
    return (
      <span
        className="text-[10px] tabular-nums text-[var(--accent-blue)]"
        aria-live="off"
        data-testid="run-timer"
      >
        {formatDuration(Math.max(0, now - runStartedAt))}
      </span>
    )
  }

  if (!isLoading && lastRunMs !== null) {
    return (
      <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]" data-testid="run-timer">
        {formatDuration(lastRunMs)}
      </span>
    )
  }

  return null
}
