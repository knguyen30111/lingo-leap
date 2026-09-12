import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CorrectionView } from './CorrectionView'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'

// Mock Tauri clipboard
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}))

// Mock the Tauri window so auto-hide can be observed without a native window
const mockHide = vi.fn<() => Promise<void>>()
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ hide: mockHide })),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'messages:placeholders.enterTextCorrect': 'Enter text to correct...',
        'messages:placeholders.correctedAppears': 'Corrected text will appear here',
        chars: 'chars',
        processing: 'Processing...',
        done: 'Done',
        regenerate: 'Regenerate',
        copy: 'Copy',
        copied: 'Copied',
        generate: 'Generate',
        noChanges: 'No changes detected',
        changesAppear: 'Changes will appear here',
        analyzing: 'Analyzing...',
      }
      return translations[key] || key
    },
  }),
}))

// Mock useCorrection hook
const mockCorrect = vi.fn()
vi.mock('../hooks/useCorrection', () => ({
  useCorrection: () => ({
    correct: mockCorrect,
  }),
}))

// Mock useSpeechToText hook - each test drives its own speech state
let capturedOnTextReady: ((text: string) => void) | undefined
let capturedLang: string | undefined
const speechState = {
  isListening: false,
  isSupported: true,
  transcript: '',
  interimTranscript: '',
  silenceDetected: false,
  error: null as string | null,
}
const mockToggleListening = vi.fn()
vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: (options?: { lang?: string; onTextReady?: (text: string) => void }) => {
    capturedOnTextReady = options?.onTextReady
    capturedLang = options?.lang
    return {
      ...speechState,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      toggleListening: mockToggleListening,
      clearTranscript: vi.fn(),
    }
  },
}))

// Mock child components
vi.mock('./LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector">LanguageSelector</div>,
}))

vi.mock('./CorrectionTabs', () => ({
  CorrectionTabs: () => <div data-testid="correction-tabs">CorrectionTabs</div>,
}))

vi.mock('./MicButton', () => ({
  MicButton: ({
    onClick,
    disabled,
    isSupported,
    isListening,
  }: {
    onClick: () => void
    disabled: boolean
    isSupported: boolean
    isListening: boolean
  }) =>
    isSupported ? (
      <button
        data-testid="mic-button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isListening}
      >
        Mic
      </button>
    ) : null,
}))

vi.mock('./SpeechPreview', () => ({
  SpeechPreview: () => <div data-testid="speech-preview" />,
}))

vi.mock('./ClearInputButton', () => ({
  ClearInputButton: ({ onClick, visible }: { onClick: () => void; visible: boolean }) => (
    visible ? <button data-testid="clear-input" onClick={onClick}>Clear</button> : null
  ),
}))

describe('CorrectionView', () => {
  beforeEach(() => {
    useAppStore.setState({
      inputText: '',
      outputText: '',
      isLoading: false,
      error: null,
      changes: [],
      isChangesLoading: false,
    })
    useSettingsStore.setState({
      speechLang: 'en',
      autoHideAfterCopy: false,
    })
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
    mockHide.mockReset()
    mockHide.mockResolvedValue(undefined)
    mockCorrect.mockClear()
    mockToggleListening.mockClear()
    capturedLang = undefined
    Object.assign(speechState, {
      isListening: false,
      isSupported: true,
      transcript: '',
      interimTranscript: '',
      silenceDetected: false,
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders input textarea', () => {
    render(<CorrectionView />)
    expect(screen.getByPlaceholderText('Enter text to correct...')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    render(<CorrectionView />)
    expect(screen.getByTestId('language-selector')).toBeInTheDocument()
  })

  it('renders correction tabs', () => {
    render(<CorrectionView />)
    expect(screen.getByTestId('correction-tabs')).toBeInTheDocument()
  })

  it('updates input text when typing', () => {
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.change(input, { target: { value: 'Hello wrold' } })

    expect(useAppStore.getState().inputText).toBe('Hello wrold')
  })

  it('shows character count', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    expect(screen.getByText('5 chars')).toBeInTheDocument()
  })

  it('shows clear button when input has text', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    expect(screen.getByTestId('clear-input')).toBeInTheDocument()
  })

  it('clears input, output, and changes when clear clicked', () => {
    useAppStore.setState({
      inputText: 'Hello',
      outputText: 'Hello corrected',
      changes: [{ from: 'wrold', to: 'world', reason: 'Typo' }],
    })
    render(<CorrectionView />)

    fireEvent.click(screen.getByTestId('clear-input'))

    const state = useAppStore.getState()
    expect(state.inputText).toBe('')
    expect(state.outputText).toBe('')
    expect(state.changes).toEqual([])
  })

  it('clears a previous error when clear clicked', () => {
    useAppStore.setState({
      inputText: 'Hello',
      outputText: 'Hello corrected',
      error: 'Correction failed',
      changes: [{ from: 'wrold', to: 'world', reason: 'Typo' }],
    })
    render(<CorrectionView />)

    fireEvent.click(screen.getByTestId('clear-input'))

    const state = useAppStore.getState()
    expect(state.inputText).toBe('')
    expect(state.outputText).toBe('')
    expect(state.error).toBeNull()
    expect(state.changes).toEqual([])
  })

  it('shows placeholder when no output', () => {
    render(<CorrectionView />)
    expect(screen.getByText('Corrected text will appear here')).toBeInTheDocument()
  })

  it('shows output text when available', () => {
    useAppStore.setState({ outputText: 'Hello world' })
    render(<CorrectionView />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useAppStore.setState({ isLoading: true })
    render(<CorrectionView />)
    expect(screen.getByText('Processing...')).toBeInTheDocument()
  })

  it('shows error message', () => {
    useAppStore.setState({ error: 'Correction failed' })
    render(<CorrectionView />)
    expect(screen.getByText('Correction failed')).toBeInTheDocument()
  })

  it('renders exactly three skeleton bars while loading', () => {
    useAppStore.setState({ isLoading: true })
    const { container } = render(<CorrectionView />)

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(3)
  })

  it('shows the loading skeleton in preference to an error', () => {
    useAppStore.setState({ isLoading: true, error: 'boom' })
    const { container } = render(<CorrectionView />)

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(3)
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('shows an error in preference to stale output', () => {
    useAppStore.setState({ error: 'boom', outputText: 'Hello world' })
    render(<CorrectionView />)

    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByText('Hello world')).not.toBeInTheDocument()
  })

  it('shows done status when output available', () => {
    useAppStore.setState({ outputText: 'Hello world' })
    render(<CorrectionView />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows generate button when no output', () => {
    render(<CorrectionView />)
    expect(screen.getByText('Generate')).toBeInTheDocument()
  })

  it('disables generate button when input empty', () => {
    render(<CorrectionView />)
    expect(screen.getByText('Generate')).toBeDisabled()
  })

  it('enables generate button when input has text', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    expect(screen.getByText('Generate')).not.toBeDisabled()
  })

  it('calls correct with skipCache when generate clicked', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)

    fireEvent.click(screen.getByText('Generate'))

    expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
  })

  it('calls correct on Cmd+Enter', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
  })

  it('calls correct on Ctrl+Enter', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
  })

  it('does not correct on Enter without modifier', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockCorrect).not.toHaveBeenCalled()
  })

  it('does not correct on Cmd+Enter when input is only whitespace', () => {
    useAppStore.setState({ inputText: '   ' })
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(mockCorrect).not.toHaveBeenCalled()
  })

  it('does not correct on Ctrl+Enter when input is only whitespace', () => {
    useAppStore.setState({ inputText: '   ' })
    render(<CorrectionView />)
    const input = screen.getByPlaceholderText('Enter text to correct...')

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(mockCorrect).not.toHaveBeenCalled()
  })

  it('titles the generate button with its keyboard shortcut', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<CorrectionView />)

    expect(screen.getByText('Generate')).toHaveAttribute('title', 'Generate (⌘+Enter)')
  })

  describe('Copy functionality', () => {
    it('shows copy button when output available', () => {
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)
      expect(screen.getByText('Copy')).toBeInTheDocument()
    })

    it('copies text when copy clicked', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('Hello world')
      })
    })

    it('shows copied state after copying', async () => {
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })

    it('keeps the copy title in both the idle and the copied state', async () => {
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      expect(screen.getByText('Copy').closest('button')).toHaveAttribute('title', 'Copy')

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(screen.getByText('Copied').closest('button')).toHaveAttribute('title', 'Copy')
    })

    it('reverts the copied state after 2000 ms', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        useAppStore.setState({ outputText: 'Hello world' })
        render(<CorrectionView />)

        fireEvent.click(screen.getByText('Copy'))
        await waitFor(() => {
          expect(screen.getByText('Copied')).toBeInTheDocument()
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(2000)
        })

        expect(screen.queryByText('Copied')).not.toBeInTheDocument()
        expect(screen.getByText('Copy')).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Regenerate functionality', () => {
    it('shows regenerate button when output available', () => {
      useAppStore.setState({ outputText: 'Hello world', inputText: 'Hello' })
      render(<CorrectionView />)
      expect(screen.getByText('Regenerate')).toBeInTheDocument()
    })

    it('calls correct with skipCache on regenerate', () => {
      useAppStore.setState({ outputText: 'Hello world', inputText: 'Hello' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Regenerate'))

      expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
    })

    it('titles the regenerate button', () => {
      useAppStore.setState({ outputText: 'Hello world', inputText: 'Hello' })
      render(<CorrectionView />)

      expect(screen.getByText('Regenerate').closest('button')).toHaveAttribute(
        'title',
        'Regenerate'
      )
    })
  })

  describe('Changes panel', () => {
    it('shows placeholder when no changes', () => {
      render(<CorrectionView />)
      expect(screen.getByText('Changes will appear here')).toBeInTheDocument()
    })

    it('shows "no changes" when output but no changes', () => {
      useAppStore.setState({ outputText: 'Hello world', changes: [] })
      render(<CorrectionView />)
      expect(screen.getByText('No changes detected')).toBeInTheDocument()
    })

    it('shows analyzing when loading changes', () => {
      useAppStore.setState({ isChangesLoading: true })
      render(<CorrectionView />)
      expect(screen.getByText('Analyzing...')).toBeInTheDocument()
    })

    it('shows changes when available', () => {
      useAppStore.setState({
        changes: [
          { from: 'wrold', to: 'world', reason: 'Typo correction' },
        ],
      })
      render(<CorrectionView />)
      expect(screen.getByText('wrold')).toBeInTheDocument()
      expect(screen.getByText('world')).toBeInTheDocument()
      expect(screen.getByText('Typo correction')).toBeInTheDocument()
    })

    it('shows multiple changes', () => {
      useAppStore.setState({
        changes: [
          { from: 'wrold', to: 'world', reason: 'Typo' },
          { from: 'helo', to: 'hello', reason: 'Typo' },
        ],
      })
      render(<CorrectionView />)
      expect(screen.getByText('wrold')).toBeInTheDocument()
      expect(screen.getByText('helo')).toBeInTheDocument()
    })

    it('shows change count', () => {
      useAppStore.setState({
        changes: [
          { from: 'wrold', to: 'world', reason: 'Typo' },
          { from: 'helo', to: 'hello', reason: 'Typo' },
        ],
      })
      render(<CorrectionView />)
      expect(screen.getByText('2 changes')).toBeInTheDocument()
    })

    it('shows singular "change" for one change', () => {
      useAppStore.setState({
        changes: [{ from: 'wrold', to: 'world', reason: 'Typo' }],
      })
      render(<CorrectionView />)
      expect(screen.getByText('1 change')).toBeInTheDocument()
    })
  })

  it('renders mic button', () => {
    render(<CorrectionView />)
    expect(screen.getByTestId('mic-button')).toBeInTheDocument()
  })

  it('disables mic button when loading', () => {
    useAppStore.setState({ isLoading: true })
    render(<CorrectionView />)
    expect(screen.getByTestId('mic-button')).toBeDisabled()
  })

  describe('Speech language selector', () => {
    it('renders speech language selector when supported', () => {
      render(<CorrectionView />)
      const speechSelect = screen.getByTitle('Speech language')
      expect(speechSelect).toBeInTheDocument()
    })

    it('changes speech language when selected', () => {
      render(<CorrectionView />)
      const speechSelect = screen.getByTitle('Speech language')

      fireEvent.change(speechSelect, { target: { value: 'ja' } })

      expect(useSettingsStore.getState().speechLang).toBe('ja')
    })
  })

  describe('Copy error handling', () => {
    it('handles copy error gracefully', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      vi.mocked(writeText).mockRejectedValueOnce(new Error('Copy failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useAppStore.setState({ outputText: 'Text to copy' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('handleTextReady callback', () => {
    it('appends speech text to empty input', () => {
      useAppStore.setState({ inputText: '' })
      render(<CorrectionView />)

      // Call the captured onTextReady callback; the test owns this store flush
      act(() => {
        capturedOnTextReady?.('Hello')
      })

      expect(useAppStore.getState().inputText).toBe('Hello')
    })

    it('appends speech text to existing input with space', () => {
      useAppStore.setState({ inputText: 'Hello' })
      render(<CorrectionView />)

      // Call the captured onTextReady callback; the test owns this store flush
      act(() => {
        capturedOnTextReady?.('world')
      })

      expect(useAppStore.getState().inputText).toBe('Hello world')
    })
  })

  describe('Speech capability boundary', () => {
    it('hides the mic control and any speech alert when recognition is unsupported', () => {
      speechState.isSupported = false
      render(<CorrectionView />)

      expect(screen.queryByTestId('mic-button')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Speech language')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText('Enter text to correct...')).toBeInTheDocument()
    })

    it('still reports a speech failure after support is lost', () => {
      speechState.isSupported = false
      speechState.error = 'Microphone access denied'
      render(<CorrectionView />)

      expect(screen.queryByTestId('mic-button')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Speech language')).not.toBeInTheDocument()
      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Microphone access denied')
    })

    it('exposes a failed attempt as one accessible alert and keeps the mic retryable', () => {
      speechState.error = 'Microphone access denied'
      render(<CorrectionView />)

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Microphone access denied')
      expect(screen.getByTestId('mic-button')).toBeEnabled()
    })

    it('keeps the speech alert distinct from a correction failure', () => {
      speechState.error = 'Speech recognition requires a network connection'
      useAppStore.setState({ error: 'Ollama request failed' })
      render(<CorrectionView />)

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Speech recognition requires a network connection')
      expect(screen.getByText('Ollama request failed')).toBeInTheDocument()
    })

    it('clears the speech alert when a retry starts listening', () => {
      speechState.error = 'Microphone access denied'
      const { rerender } = render(<CorrectionView />)
      expect(screen.getAllByRole('alert')).toHaveLength(1)

      speechState.error = null
      speechState.isListening = true
      rerender(<CorrectionView />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('mic-button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('labels the speech language control as a language control', () => {
      render(<CorrectionView />)

      const speechSelect = screen.getByLabelText('Speech language')
      expect(speechSelect).toBe(screen.getByTitle('Speech language'))

      fireEvent.change(speechSelect, { target: { value: 'ko' } })
      expect(useSettingsStore.getState().speechLang).toBe('ko')
    })

    it('passes the selected speech language to the hook', () => {
      useSettingsStore.setState({ speechLang: 'ja' })
      render(<CorrectionView />)

      expect(capturedLang).toBe('ja')
    })
  })

  describe('Focus behavior', () => {
    it('keeps focus on the textarea across a chord submit', () => {
      useAppStore.setState({ inputText: 'hello' })
      render(<CorrectionView />)
      const textarea = screen.getByPlaceholderText('Enter text to correct...')
      textarea.focus()
      expect(document.activeElement).toBe(textarea)

      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
      expect(document.activeElement).toBe(textarea)
    })

    it('keeps focus on the copy button across the copied re-render', async () => {
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)
      const copyButton = screen.getByText('Copy').closest('button') as HTMLButtonElement
      copyButton.focus()
      expect(document.activeElement).toBe(copyButton)

      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(document.activeElement).toBe(copyButton)
    })

    it('moves focus to the clear control on press and to the body once it unmounts', async () => {
      const user = userEvent.setup()
      useAppStore.setState({ inputText: 'Hello' })
      render(<CorrectionView />)
      const textarea = screen.getByPlaceholderText('Enter text to correct...')
      textarea.focus()
      expect(document.activeElement).toBe(textarea)

      // Real pointer activation, not fireEvent.click: a press focuses the control it lands
      // on, which is what a browser does and what a synthetic click never models. Press and
      // release are issued separately so the press-time focus target can be read while the
      // control is still mounted. This sequence was measured identical at base 60ea115.
      const clear = screen.getByTestId('clear-input')
      await user.pointer({ target: clear, keys: '[MouseLeft>]' })
      expect(document.activeElement).toBe(clear)

      await user.pointer({ target: clear, keys: '[/MouseLeft]' })

      // The control took focus and then left the document, so focus falls to the body.
      // Nothing refocuses the textarea; asserting that it does would be fiction.
      expect(screen.queryByTestId('clear-input')).not.toBeInTheDocument()
      expect(document.activeElement).toBe(document.body)
      expect(document.activeElement).not.toBe(textarea)
      // The textarea itself is not remounted: same node, emptied in place.
      expect(screen.getByPlaceholderText('Enter text to correct...')).toBe(textarea)
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })

  describe('Auto hide after copy', () => {
    it('does not hide the window when auto hide is off', async () => {
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(mockHide).not.toHaveBeenCalled()
    })

    it('hides the window after a successful copy when auto hide is on', async () => {
      useSettingsStore.setState({ autoHideAfterCopy: true })
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(mockHide).toHaveBeenCalledTimes(1)
      })
    })

    it('never hides the window when the clipboard write fails', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      vi.mocked(writeText).mockRejectedValueOnce(new Error('Copy failed'))
      useSettingsStore.setState({ autoHideAfterCopy: true })
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalled()
      })
      expect(mockHide).not.toHaveBeenCalled()
      expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    })

    it('keeps the copied state when only the hide fails', async () => {
      mockHide.mockRejectedValueOnce(new Error('hide denied'))
      useSettingsStore.setState({ autoHideAfterCopy: true })
      useAppStore.setState({ outputText: 'Hello world' })
      render(<CorrectionView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(
        useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError
      ).toContain('hide denied')
    })
  })
})
