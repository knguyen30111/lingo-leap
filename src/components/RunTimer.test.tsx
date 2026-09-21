import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { RunTimer, formatDuration } from './RunTimer'
import { useAppStore } from '../stores/appStore'

describe('formatDuration', () => {
  it('shows sub-second runs in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(840)).toBe('840ms')
  })

  it('shows seconds with one decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(6200)).toBe('6.2s')
    expect(formatDuration(59900)).toBe('59.9s')
  })

  // A reasoning run on a local model regularly passes a minute.
  it('breaks into minutes past sixty seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s')
    expect(formatDuration(63000)).toBe('1m 3s')
    expect(formatDuration(125000)).toBe('2m 5s')
  })
})

describe('RunTimer', () => {
  beforeEach(() => {
    useAppStore.setState({ isLoading: false, runStartedAt: null, lastRunMs: null })
  })

  afterEach(() => vi.useRealTimers())

  it('renders nothing before the first run', () => {
    const { container } = render(<RunTimer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts up while a run is in flight', () => {
    vi.useFakeTimers()
    const t0 = Date.now()
    useAppStore.setState({ isLoading: true, runStartedAt: t0 })
    render(<RunTimer />)

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    expect(screen.getByTestId('run-timer').textContent).toBe('2.5s')
  })

  it('reports the final duration once the run finishes', () => {
    useAppStore.setState({ isLoading: false, runStartedAt: null, lastRunMs: 6200 })
    render(<RunTimer />)
    expect(screen.getByTestId('run-timer').textContent).toBe('6.2s')
  })

  it('prefers the live count over the previous run while loading', () => {
    vi.useFakeTimers()
    useAppStore.setState({ isLoading: true, runStartedAt: Date.now(), lastRunMs: 60000 })
    render(<RunTimer />)

    expect(screen.getByTestId('run-timer').textContent).not.toBe('1m 0s')
  })
})
