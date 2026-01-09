import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TranslationView } from './TranslationView'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'

// Mock Tauri clipboard
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
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

// Mock useSpeechToText hook - capture onTextReady for testing
let capturedOnTextReady: ((text: string) => void) | undefined
vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: (options?: { onTextReady?: (text: string) => void }) => {
    capturedOnTextReady = options?.onTextReady
    return {
      isListening: false,
      isSupported: true,
      transcript: '',
      interimTranscript: '',
      silenceDetected: false,
      toggleListening: vi.fn(),
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
}))

// Mock child components
vi.mock('./LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector">LanguageSelector</div>,
}))

vi.mock('./MicButton', () => ({
  MicButton: ({ onClick, disabled }: { onClick: () => void; disabled: boolean }) => (
    <button data-testid="mic-button" onClick={onClick} disabled={disabled}>Mic</button>
  ),
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
      targetLang: 'vi',
      isLoading: false,
      error: null,
    })
    useSettingsStore.setState({
      speechLang: 'en',
    })
    mockTranslate.mockClear()
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

      // Call the captured onTextReady callback
      if (capturedOnTextReady) {
        capturedOnTextReady('Hello')
      }

      expect(useAppStore.getState().inputText).toBe('Hello')
    })

    it('appends speech text to existing input with space', () => {
      useAppStore.setState({ inputText: 'Hello' })
      render(<TranslationView />)

      // Call the captured onTextReady callback
      if (capturedOnTextReady) {
        capturedOnTextReady('world')
      }

      expect(useAppStore.getState().inputText).toBe('Hello world')
    })
  })
})
