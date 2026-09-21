import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReasoningToggle } from './ReasoningToggle'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const map: Record<string, string> = {
        'messages:reasoning.label': 'Response speed',
        'messages:reasoning.instant': 'Instant',
        'messages:reasoning.thinking': 'Thinking',
        'messages:reasoning.unsupported': `${vars?.model ?? ''} cannot reason.`,
      }
      return map[key] ?? key
    },
  }),
}))

describe('ReasoningToggle', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      reasoningMode: 'instant',
      correctionModel: 'qwen2.5:7b',
      ollamaHost: 'http://localhost:11434',
    })
    useAppStore.setState({
      isLoading: false,
      isChangesLoading: false,
      outputText: '',
      changes: [],
      thinkingText: '',
    })
  })

  afterEach(() => vi.restoreAllMocks())

  const thinkingButton = () => screen.getByRole('button', { name: /Thinking/ })

  it('offers Thinking when the model advertises the capability', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockResolvedValue(true)
    render(<ReasoningToggle />)

    await waitFor(() => expect(thinkingButton()).not.toBeDisabled())
  })

  // Ollama fails the whole generation with "<model> does not support thinking",
  // so an unsupported model must never be selectable.
  it('disables Thinking when the model cannot reason', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockResolvedValue(false)
    render(<ReasoningToggle />)

    await waitFor(() => expect(thinkingButton()).toBeDisabled())
    expect(thinkingButton().getAttribute('title')).toContain('cannot reason')
  })

  it('keeps Thinking disabled while capability is still unknown', () => {
    // never resolves, so no state update escapes act here
    vi.spyOn(ollamaClient, 'supportsThinking').mockReturnValue(new Promise(() => {}))
    render(<ReasoningToggle />)

    expect(thinkingButton()).toBeDisabled()
  })

  it('treats a capability lookup failure as unsupported', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockRejectedValue(new Error('offline'))
    render(<ReasoningToggle />)

    await waitFor(() => expect(thinkingButton()).toBeDisabled())
  })

  it('switches mode and clears the result it no longer describes', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockResolvedValue(true)
    useAppStore.setState({
      outputText: 'an instant result',
      changes: [{ from: 'a', to: 'b', reason: 'x' }],
      thinkingText: 'old trace',
    })
    render(<ReasoningToggle />)

    await waitFor(() => expect(thinkingButton()).not.toBeDisabled())
    fireEvent.click(thinkingButton())

    expect(useSettingsStore.getState().reasoningMode).toBe('thinking')
    const state = useAppStore.getState()
    expect(state.outputText).toBe('')
    expect(state.changes).toEqual([])
    expect(state.thinkingText).toBe('')
  })

  it('does not clear the result when the active mode is reselected', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockResolvedValue(true)
    useAppStore.setState({ outputText: 'keep me' })
    render(<ReasoningToggle />)
    await waitFor(() => expect(thinkingButton()).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /Instant/ }))

    expect(useAppStore.getState().outputText).toBe('keep me')
  })

  it('is inert while a correction is running', async () => {
    vi.spyOn(ollamaClient, 'supportsThinking').mockResolvedValue(true)
    useAppStore.setState({ isLoading: true })
    render(<ReasoningToggle />)

    await waitFor(() => expect(thinkingButton()).toBeDisabled())
    expect(screen.getByRole('button', { name: /Instant/ })).toBeDisabled()
  })
})
