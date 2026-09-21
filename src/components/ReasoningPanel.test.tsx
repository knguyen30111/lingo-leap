import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReasoningPanel } from './ReasoningPanel'
import { useAppStore } from '../stores/appStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'reasoning.thinkingNow': 'Reasoning...',
        'reasoning.trace': 'Reasoning',
        'reasoning.waiting': 'Waiting for the model...',
      }
      return map[key] ?? key
    },
  }),
}))

describe('ReasoningPanel', () => {
  beforeEach(() => {
    useAppStore.setState({ thinkingText: '', isThinking: false })
  })

  it('stays out of the way when there is no reasoning', () => {
    const { container } = render(<ReasoningPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces an in-progress reasoning pass before any text arrives', () => {
    useAppStore.setState({ isThinking: true })
    render(<ReasoningPanel />)
    expect(screen.getByText('Reasoning...')).toBeInTheDocument()
  })

  // The trace is long and lands before the answer, so it must not push the
  // corrected text off screen by default.
  it('keeps the trace collapsed until asked', () => {
    useAppStore.setState({ thinkingText: 'first I check the tense' })
    render(<ReasoningPanel />)

    expect(screen.queryByText('first I check the tense')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('reveals and hides the trace on toggle', () => {
    useAppStore.setState({ thinkingText: 'first I check the tense' })
    render(<ReasoningPanel />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('first I check the tense')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('first I check the tense')).not.toBeInTheDocument()
  })

  it('shows a placeholder while expanded and still waiting', () => {
    useAppStore.setState({ isThinking: true })
    render(<ReasoningPanel />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Waiting for the model...')).toBeInTheDocument()
  })
})
