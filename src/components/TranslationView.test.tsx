import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranslationView } from './TranslationView'
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
        autoDetect: 'Auto-detect',
        'messages:placeholders.enterTextTranslate': 'Enter text to translate...',
        'messages:placeholders.translationAppears': 'Translation will appear here',
        chars: 'chars',
        translating: 'Translating...',
        done: 'Done',
        reTranslate: 'Re-translate',
        copy: 'Copy',
        copied: 'Copied',
        translate: 'Translate',
      }
      return translations[key] || key
    },
  }),
}))

// Mock useTranslation hook (translation logic)
const mockTranslate = vi.fn()
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    translate: mockTranslate,
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

// Mock language library
vi.mock('../lib/language', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'auto', name: 'Auto', nativeName: 'Auto-detect' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  ],
  getLanguageNativeName: (code: string) =>
    ({ auto: 'Auto-detect', en: 'English', vi: 'Tiếng Việt', ja: '日本語' })[code] ?? code,
}))

// Mock child components
vi.mock('./LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector">LanguageSelector</div>,
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

describe('TranslationView', () => {
  beforeEach(() => {
    useAppStore.setState({
      inputText: '',
      outputText: '',
      sourceLang: 'auto',
      latestDetectedSourceLang: null,
      targetLang: 'vi',
      isLoading: false,
      error: null,
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
    mockTranslate.mockClear()
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
    render(<TranslationView />)
    expect(screen.getByPlaceholderText('Enter text to translate...')).toBeInTheDocument()
  })

  it('renders source and target language selectors', () => {
    render(<TranslationView />)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(2)
  })

  it('renders language selector component', () => {
    render(<TranslationView />)
    expect(screen.getByTestId('language-selector')).toBeInTheDocument()
  })

  it('updates input text when typing', () => {
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.change(input, { target: { value: 'Hello world' } })

    expect(useAppStore.getState().inputText).toBe('Hello world')
  })

  it('shows character count', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    expect(screen.getByText('5 chars')).toBeInTheDocument()
  })

  it('shows clear button when input has text', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    expect(screen.getByTestId('clear-input')).toBeInTheDocument()
  })

  it('does not show clear button when input is empty', () => {
    useAppStore.setState({ inputText: '' })
    render(<TranslationView />)
    expect(screen.queryByTestId('clear-input')).not.toBeInTheDocument()
  })

  it('clears input and output when clear clicked', () => {
    useAppStore.setState({ inputText: 'Hello', outputText: 'Xin chào' })
    render(<TranslationView />)

    fireEvent.click(screen.getByTestId('clear-input'))

    expect(useAppStore.getState().inputText).toBe('')
    expect(useAppStore.getState().outputText).toBe('')
  })

  it('clears a previous error when clear clicked', () => {
    useAppStore.setState({
      inputText: 'Hello',
      outputText: 'Xin chào',
      error: 'Translation failed',
    })
    render(<TranslationView />)

    fireEvent.click(screen.getByTestId('clear-input'))

    const state = useAppStore.getState()
    expect(state.inputText).toBe('')
    expect(state.outputText).toBe('')
    expect(state.error).toBeNull()
  })

  it('shows placeholder when no output', () => {
    render(<TranslationView />)
    expect(screen.getByText('Translation will appear here')).toBeInTheDocument()
  })

  it('shows output text when available', () => {
    useAppStore.setState({ outputText: 'Xin chào thế giới' })
    render(<TranslationView />)
    expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    useAppStore.setState({ isLoading: true })
    render(<TranslationView />)
    expect(screen.getByText('Translating...')).toBeInTheDocument()
  })

  it('shows error message', () => {
    useAppStore.setState({ error: 'Translation failed' })
    render(<TranslationView />)
    expect(screen.getByText('Translation failed')).toBeInTheDocument()
  })

  it('renders exactly four skeleton bars while loading', () => {
    useAppStore.setState({ isLoading: true })
    const { container } = render(<TranslationView />)

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(4)
  })

  it('shows the loading skeleton in preference to an error', () => {
    useAppStore.setState({ isLoading: true, error: 'boom' })
    const { container } = render(<TranslationView />)

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(4)
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('shows an error in preference to stale output', () => {
    useAppStore.setState({ error: 'boom', outputText: 'Xin chào' })
    render(<TranslationView />)

    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByText('Xin chào')).not.toBeInTheDocument()
  })

  it('shows done status when output available', () => {
    useAppStore.setState({ outputText: 'Xin chào' })
    render(<TranslationView />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows translate button when no output', () => {
    render(<TranslationView />)
    expect(screen.getByText('Translate')).toBeInTheDocument()
  })

  it('disables translate button when input empty', () => {
    render(<TranslationView />)
    expect(screen.getByText('Translate')).toBeDisabled()
  })

  it('enables translate button when input has text', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    expect(screen.getByText('Translate')).not.toBeDisabled()
  })

  it('calls translate with skipCache when translate clicked', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)

    fireEvent.click(screen.getByText('Translate'))

    expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
  })

  it('calls translate on Cmd+Enter', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
  })

  it('calls translate on Ctrl+Enter', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
  })

  it('does not translate on Enter without modifier', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('does not translate on Cmd+Enter when input is only whitespace', () => {
    useAppStore.setState({ inputText: '   ' })
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('does not translate on Ctrl+Enter when input is only whitespace', () => {
    useAppStore.setState({ inputText: '   ' })
    render(<TranslationView />)
    const input = screen.getByPlaceholderText('Enter text to translate...')

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('titles the translate button with its keyboard shortcut', () => {
    useAppStore.setState({ inputText: 'Hello' })
    render(<TranslationView />)

    expect(screen.getByText('Translate')).toHaveAttribute('title', 'Translate (⌘+Enter)')
  })

  describe('Copy functionality', () => {
    it('shows copy button when output available', () => {
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)
      expect(screen.getByText('Copy')).toBeInTheDocument()
    })

    it('copies text when copy clicked', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('Xin chào')
      })
    })

    it('shows copied state after copying', async () => {
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })

    it('keeps the copy title in both the idle and the copied state', async () => {
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

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
        useAppStore.setState({ outputText: 'Xin chào' })
        render(<TranslationView />)

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

  describe('Re-translate functionality', () => {
    it('shows re-translate button when output available', () => {
      useAppStore.setState({ outputText: 'Xin chào', inputText: 'Hello' })
      render(<TranslationView />)
      expect(screen.getByText('Re-translate')).toBeInTheDocument()
    })

    it('calls translate with skipCache on re-translate', () => {
      useAppStore.setState({ outputText: 'Xin chào', inputText: 'Hello' })
      render(<TranslationView />)

      fireEvent.click(screen.getByText('Re-translate'))

      expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
    })

    it('titles the re-translate button', () => {
      useAppStore.setState({ outputText: 'Xin chào', inputText: 'Hello' })
      render(<TranslationView />)

      expect(screen.getByText('Re-translate').closest('button')).toHaveAttribute(
        'title',
        'Re-translate'
      )
    })
  })

  describe('Language selection', () => {
    it('changes source language', () => {
      render(<TranslationView />)
      const selects = screen.getAllByRole('combobox')
      const sourceSelect = selects[0]

      fireEvent.change(sourceSelect, { target: { value: 'en' } })

      expect(useAppStore.getState().sourceLang).toBe('en')
    })

    it('changes target language', () => {
      render(<TranslationView />)
      const selects = screen.getAllByRole('combobox')
      // Target select is typically the second one after source and speech lang
      // Find the one with 'vi' value (default target)
      const targetSelect = Array.from(selects).find(
        (s) => (s as HTMLSelectElement).value === 'vi'
      )

      if (targetSelect) {
        fireEvent.change(targetSelect, { target: { value: 'ja' } })
        expect(useAppStore.getState().targetLang).toBe('ja')
      }
    })
  })

  it('renders mic button', () => {
    render(<TranslationView />)
    expect(screen.getByTestId('mic-button')).toBeInTheDocument()
  })

  it('disables mic button when loading', () => {
    useAppStore.setState({ isLoading: true })
    render(<TranslationView />)
    expect(screen.getByTestId('mic-button')).toBeDisabled()
  })

  describe('Speech language selector', () => {
    it('renders speech language selector when supported', () => {
      render(<TranslationView />)
      const speechSelect = screen.getByTitle('Speech language')
      expect(speechSelect).toBeInTheDocument()
    })

    it('changes speech language when selected', () => {
      render(<TranslationView />)
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
      render(<TranslationView />)

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
      render(<TranslationView />)

      // Call the captured onTextReady callback; the test owns this store flush
      act(() => {
        capturedOnTextReady?.('Hello')
      })

      expect(useAppStore.getState().inputText).toBe('Hello')
    })

    it('appends speech text to existing input with space', () => {
      useAppStore.setState({ inputText: 'Hello' })
      render(<TranslationView />)

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
      render(<TranslationView />)

      expect(screen.queryByTestId('mic-button')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Speech language')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // The unrelated translation language controls stay usable
      expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2)
    })

    it('still reports a speech failure after support is lost', () => {
      speechState.isSupported = false
      speechState.error = 'Microphone access denied'
      render(<TranslationView />)

      expect(screen.queryByTestId('mic-button')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Speech language')).not.toBeInTheDocument()
      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Microphone access denied')
    })

    it('exposes a failed attempt as one accessible alert and keeps the mic retryable', () => {
      speechState.error = 'Microphone access denied'
      render(<TranslationView />)

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Microphone access denied')
      expect(screen.getByTestId('mic-button')).toBeEnabled()
    })

    it('keeps the speech alert distinct from a translation failure', () => {
      speechState.error = 'Speech recognition requires a network connection'
      useAppStore.setState({ error: 'Ollama request failed' })
      render(<TranslationView />)

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent('Speech recognition requires a network connection')
      expect(screen.getByText('Ollama request failed')).toBeInTheDocument()
    })

    it('clears the speech alert when a retry starts listening', () => {
      speechState.error = 'Microphone access denied'
      const { rerender } = render(<TranslationView />)
      expect(screen.getAllByRole('alert')).toHaveLength(1)

      speechState.error = null
      speechState.isListening = true
      rerender(<TranslationView />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('mic-button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('labels the speech language control as a language control', () => {
      render(<TranslationView />)

      const speechSelect = screen.getByLabelText('Speech language')
      expect(speechSelect).toBe(screen.getByTitle('Speech language'))

      fireEvent.change(speechSelect, { target: { value: 'ko' } })
      expect(useSettingsStore.getState().speechLang).toBe('ko')
    })

    it('passes the selected speech language to the hook', () => {
      useSettingsStore.setState({ speechLang: 'ja' })
      render(<TranslationView />)

      expect(capturedLang).toBe('ja')
    })
  })

  describe('Focus behavior', () => {
    it('keeps focus on the textarea across a chord submit', () => {
      useAppStore.setState({ inputText: 'hello' })
      render(<TranslationView />)
      const textarea = screen.getByPlaceholderText('Enter text to translate...')
      textarea.focus()
      expect(document.activeElement).toBe(textarea)

      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
      expect(document.activeElement).toBe(textarea)
    })

    it('keeps focus on the copy button across the copied re-render', async () => {
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)
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
      render(<TranslationView />)
      const textarea = screen.getByPlaceholderText('Enter text to translate...')
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
      expect(screen.getByPlaceholderText('Enter text to translate...')).toBe(textarea)
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })
})

describe('TranslationView detected source language', () => {
  beforeEach(() => {
    useAppStore.setState({
      inputText: 'こんにちは',
      outputText: '',
      sourceLang: 'auto',
      latestDetectedSourceLang: null,
      targetLang: 'vi',
      isLoading: false,
      error: null,
    })
    useSettingsStore.setState({ speechLang: 'en' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps auto selected while naming the detected language', () => {
    useAppStore.setState({ latestDetectedSourceLang: 'ja' })

    render(<TranslationView />)

    const sourceSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(sourceSelect.value).toBe('auto')
    expect(screen.getByRole('option', { name: 'Auto-detect (日本語)' })).toBeInTheDocument()
  })

  it('shows the plain auto label before anything is detected', () => {
    render(<TranslationView />)

    expect(screen.getByRole('option', { name: 'Auto-detect' })).toBeInTheDocument()
  })

  it('does not name a detected language for a manual source selection', () => {
    useAppStore.setState({ sourceLang: 'en', latestDetectedSourceLang: 'ja' })

    render(<TranslationView />)

    const sourceSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(sourceSelect.value).toBe('en')
    expect(screen.getByRole('option', { name: 'Auto-detect' })).toBeInTheDocument()
  })

  it('leaves the selected source language unchanged when detection updates', () => {
    const { rerender } = render(<TranslationView />)

    act(() => {
      useAppStore.setState({ latestDetectedSourceLang: 'ja' })
    })
    rerender(<TranslationView />)

    expect(useAppStore.getState().sourceLang).toBe('auto')
    expect(screen.getByRole('option', { name: 'Auto-detect (日本語)' })).toBeInTheDocument()
  })

  describe('Auto hide after copy', () => {
    it('does not hide the window when auto hide is off', async () => {
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(mockHide).not.toHaveBeenCalled()
    })

    it('hides the window after a successful copy when auto hide is on', async () => {
      useSettingsStore.setState({ autoHideAfterCopy: true })
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(mockHide).toHaveBeenCalledTimes(1)
      })
    })

    it('never hides the window when the clipboard write fails', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      vi.mocked(writeText).mockRejectedValueOnce(new Error('Copy failed'))
      useSettingsStore.setState({ autoHideAfterCopy: true })
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

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
      useAppStore.setState({ outputText: 'Xin chào' })
      render(<TranslationView />)

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
