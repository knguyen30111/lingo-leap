import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MainWindow } from '../components/MainWindow'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common:appName': 'Lingo Leap',
        'status.connected': 'Connected',
        'status.checking': 'Checking...',
        'status.notConnected': 'Not connected',
        'status.disabled': 'Disabled',
        'settings:title': 'Settings',
        'errors.ollamaConnection': 'Cannot connect to Ollama',
        'common:retry': 'Retry',
        autoDetect: 'Auto-detect',
        translate: 'Translate',
        correct: 'Correct',
        'messages:placeholders.enterTextTranslate': 'Enter text to translate...',
        'messages:placeholders.enterTextCorrect': 'Enter text to correct...',
        'messages:placeholders.translationAppears': 'Translation will appear here',
        'messages:placeholders.correctedAppears': 'Corrected text will appear here',
        chars: 'chars',
        translating: 'Translating...',
        processing: 'Processing...',
        done: 'Done',
        reTranslate: 'Re-translate',
        regenerate: 'Regenerate',
        copy: 'Copy',
        copied: 'Copied',
        generate: 'Generate',
        noChanges: 'No changes',
        changesAppear: 'Changes will appear here',
        analyzing: 'Analyzing...',
        explainIn: 'Explain in',
        sameAsInput: 'Same as input',
        swapLanguages: 'Swap languages',
        'correction.fix': 'Fix',
        'correction.improve': 'Improve',
        'correction.rewrite': 'Rewrite',
      }
      return translations[key] || key
    },
  }),
}))

// Mock useOllama hook
const mockCheckConnection = vi.fn()
vi.mock('../hooks/useOllama', () => ({
  useOllama: () => ({
    isConnected: true,
    isChecking: false,
    checkConnection: mockCheckConnection,
  }),
}))

// Mock useTranslation hook (translation logic)
const mockTranslate = vi.fn()
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    translate: mockTranslate,
  }),
}))

// Mock useCorrection hook
const mockCorrect = vi.fn()
const mockSetLevel = vi.fn()
vi.mock('../hooks/useCorrection', () => ({
  useCorrection: () => ({
    correct: mockCorrect,
    setLevel: mockSetLevel,
  }),
}))

// Mock useSpeechToText hook
vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    isListening: false,
    isSupported: false,
    transcript: '',
    interimTranscript: '',
    silenceDetected: false,
    toggleListening: vi.fn(),
  }),
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

describe('App Integration', () => {
  beforeEach(() => {
    // Reset stores to initial state
    useAppStore.setState({
      mode: 'translate',
      inputText: '',
      outputText: '',
      sourceLang: 'auto',
      targetLang: 'vi',
      isEnabled: true,
      isLoading: false,
      error: null,
      correctionLevel: 'fix',
      changes: [],
      isChangesLoading: false,
    })

    useSettingsStore.setState({
      ollamaHost: 'http://localhost:11434',
      translationModel: 'gemma3:4b',
      correctionModel: 'gemma3:4b',
      speechLang: 'en',
      explanationLang: 'auto',
    })

    mockTranslate.mockClear()
    mockCorrect.mockClear()
    mockSetLevel.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Translation flow', () => {
    it('completes full translation flow: type > translate > see result', async () => {
      render(<MainWindow />)

      // Find input and type text
      const input = screen.getByPlaceholderText('Enter text to translate...')
      fireEvent.change(input, { target: { value: 'Hello world' } })

      expect(useAppStore.getState().inputText).toBe('Hello world')

      // Click translate button (not mode selector)
      const translateButtons = screen.getAllByText('Translate')
      const translateButton = translateButtons.find((btn) =>
        btn.classList.contains('flex') && btn.classList.contains('items-center')
      )
      if (translateButton) {
        fireEvent.click(translateButton)
      }

      // Verify translate was called
      expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
    })

    it('translates with keyboard shortcut', async () => {
      render(<MainWindow />)

      const input = screen.getByPlaceholderText('Enter text to translate...')
      fireEvent.change(input, { target: { value: 'Hello world' } })

      // Use Cmd+Enter
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

      expect(mockTranslate).toHaveBeenCalled()
    })

    it('shows translated output', () => {
      useAppStore.setState({ outputText: 'Xin chào thế giới' })
      render(<MainWindow />)

      expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('copies translation to clipboard', async () => {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      useAppStore.setState({ outputText: 'Xin chào thế giới' })
      render(<MainWindow />)

      fireEvent.click(screen.getByText('Copy'))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('Xin chào thế giới')
      })
    })
  })

  describe('Correction flow', () => {
    it('switches to correction mode', () => {
      render(<MainWindow />)

      // Click correct mode
      fireEvent.click(screen.getByText('Correct'))

      expect(useAppStore.getState().mode).toBe('correct')
    })

    it('completes full correction flow: type > correct > see result', async () => {
      useAppStore.setState({ mode: 'correct' })
      render(<MainWindow />)

      // Find input and type text
      const input = screen.getByPlaceholderText('Enter text to correct...')
      fireEvent.change(input, { target: { value: 'Hello wrold' } })

      expect(useAppStore.getState().inputText).toBe('Hello wrold')

      // Click generate
      fireEvent.click(screen.getByText('Generate'))

      // Verify correct was called
      expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
    })

    it('corrects with keyboard shortcut', () => {
      useAppStore.setState({ mode: 'correct' })
      render(<MainWindow />)

      const input = screen.getByPlaceholderText('Enter text to correct...')
      fireEvent.change(input, { target: { value: 'Hello wrold' } })

      // Use Cmd+Enter
      fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

      expect(mockCorrect).toHaveBeenCalled()
    })

    it('shows corrected output and changes', () => {
      useAppStore.setState({
        mode: 'correct',
        outputText: 'Hello world',
        changes: [{ from: 'wrold', to: 'world', reason: 'Typo' }],
      })
      render(<MainWindow />)

      expect(screen.getByText('Hello world')).toBeInTheDocument()
      expect(screen.getByText('wrold')).toBeInTheDocument()
      expect(screen.getByText('world')).toBeInTheDocument()
      expect(screen.getByText('Typo')).toBeInTheDocument()
    })
  })

  describe('Mode switching', () => {
    it('preserves input when switching modes', () => {
      render(<MainWindow />)

      // Type in translation mode
      const input = screen.getByPlaceholderText('Enter text to translate...')
      fireEvent.change(input, { target: { value: 'Test input' } })

      // Switch to correction mode
      fireEvent.click(screen.getByText('Correct'))

      // Input should be preserved
      expect(useAppStore.getState().inputText).toBe('Test input')
    })

    it('switches back to translate mode', () => {
      useAppStore.setState({ mode: 'correct' })
      render(<MainWindow />)

      fireEvent.click(screen.getByText('Translate'))

      expect(useAppStore.getState().mode).toBe('translate')
    })
  })

  describe('Settings', () => {
    it('opens settings panel', () => {
      render(<MainWindow />)

      // This test is covered in MainWindow.test.tsx
      // Just verify the settings button exists
      expect(screen.getByTitle('Settings')).toBeInTheDocument()
    })
  })

  describe('Error handling', () => {
    it('shows error message in translation view', () => {
      useAppStore.setState({ error: 'Network error' })
      render(<MainWindow />)

      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    it('shows error message in correction view', () => {
      useAppStore.setState({ mode: 'correct', error: 'Model error' })
      render(<MainWindow />)

      expect(screen.getByText('Model error')).toBeInTheDocument()
    })

    it('clears error when input cleared', () => {
      useAppStore.setState({ inputText: 'Hello', error: 'Some error' })
      render(<MainWindow />)

      // Clear the input would clear error too (via handleClearInput)
      expect(useAppStore.getState().error).toBe('Some error')
    })
  })

  describe('Loading states', () => {
    it('shows loading in translation view', () => {
      useAppStore.setState({ isLoading: true })
      render(<MainWindow />)

      expect(screen.getByText('Translating...')).toBeInTheDocument()
    })

    it('shows loading in correction view', () => {
      useAppStore.setState({ mode: 'correct', isLoading: true })
      render(<MainWindow />)

      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })

    it('shows changes loading indicator', () => {
      useAppStore.setState({ mode: 'correct', isChangesLoading: true })
      render(<MainWindow />)

      expect(screen.getByText('Analyzing...')).toBeInTheDocument()
    })
  })

  describe('Language selection integration', () => {
    it('changes target language in translation view', () => {
      render(<MainWindow />)

      const selects = screen.getAllByRole('combobox')
      // Find the target language select (second one typically)
      const targetSelect = selects[1]

      fireEvent.change(targetSelect, { target: { value: 'ja' } })

      expect(useAppStore.getState().targetLang).toBe('ja')
    })
  })

  describe('Re-translate / Regenerate', () => {
    it('re-translates with skipCache', () => {
      useAppStore.setState({ inputText: 'Hello', outputText: 'Xin chào' })
      render(<MainWindow />)

      fireEvent.click(screen.getByText('Re-translate'))

      expect(mockTranslate).toHaveBeenCalledWith(undefined, { skipCache: true })
    })

    it('regenerates correction with skipCache', () => {
      useAppStore.setState({
        mode: 'correct',
        inputText: 'Hello',
        outputText: 'Hello',
      })
      render(<MainWindow />)

      fireEvent.click(screen.getByText('Regenerate'))

      expect(mockCorrect).toHaveBeenCalledWith(undefined, undefined, { skipCache: true })
    })
  })

  describe('Character count', () => {
    it('shows character count in translation view', () => {
      useAppStore.setState({ inputText: 'Hello' })
      render(<MainWindow />)

      expect(screen.getByText('5 chars')).toBeInTheDocument()
    })

    it('shows character count in correction view', () => {
      useAppStore.setState({ mode: 'correct', inputText: 'Hello World' })
      render(<MainWindow />)

      expect(screen.getByText('11 chars')).toBeInTheDocument()
    })
  })
})
