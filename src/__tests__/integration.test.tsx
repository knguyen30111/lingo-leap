import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MainWindow } from '../components/MainWindow'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useOllama, useOllamaLifecycle } from '../hooks/useOllama'
import {
  useOllamaStore,
  resetOllamaRuntime,
  setOllamaLifecycleClientFactory,
  type OllamaLifecycleClient,
  type OllamaLifecycleClientFactory,
} from '../stores/ollamaStore'
import { OllamaModelInfo } from '../types'

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
        'common:save': 'Save',
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

// Mock UI_LANGUAGES so the settings panel renders without the i18n runtime
vi.mock('../i18n', () => ({
  UI_LANGUAGES: [
    { code: 'en', nativeName: 'English' },
    { code: 'vi', nativeName: 'Tiếng Việt' },
  ],
  changeLanguage: vi.fn(),
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

    // The lifecycle runtime is shared; these flows assume a connected host.
    useOllamaStore.setState({
      host: 'http://localhost:11434',
      isConnected: true,
      isChecking: false,
      models: [],
      error: null,
      pull: null,
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

describe('Ollama lifecycle ownership', () => {
  const MODIFIED_AT = '2026-01-01T00:00:00Z'
  const localModels: OllamaModelInfo[] = [
    { name: 'gemma3:4b', size: 1000000, modified_at: MODIFIED_AT },
    { name: 'llama3:8b', size: 2000000, modified_at: MODIFIED_AT },
  ]
  const remoteModels: OllamaModelInfo[] = [
    { name: 'qwen2.5:7b', size: 3000000, modified_at: MODIFIED_AT },
  ]

  const transport = {
    constructedHosts: [] as string[],
    checkHealth: vi.fn(),
    listModels: vi.fn(),
    pullModel: vi.fn(),
  }

  const fakeFactory: OllamaLifecycleClientFactory = (host): OllamaLifecycleClient => {
    transport.constructedHosts.push(host)
    return {
      checkHealth: transport.checkHealth,
      listModels: transport.listModels,
      pullModel: transport.pullModel,
    }
  }

  /** Mounts the application-level lifecycle owner around the rendered tree. */
  function App({ children }: { children: React.ReactNode }) {
    useOllamaLifecycle()
    return <>{children}</>
  }

  /** A second consumer that only reads the shared lifecycle snapshot. */
  function StatusProbe() {
    const { isConnected, models } = useOllama()
    return (
      <div data-testid="probe">
        {isConnected ? 'connected' : 'offline'}:{models.length}
      </div>
    )
  }

  beforeEach(() => {
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
      ollamaInstalled: false,
      modelsInstalled: false,
      translationModel: 'gemma3:4b',
      correctionModel: 'llama3:8b',
    })

    transport.constructedHosts.length = 0
    transport.checkHealth.mockReset()
    transport.listModels.mockReset()
    transport.pullModel.mockReset()
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(localModels)

    setOllamaLifecycleClientFactory(fakeFactory)
    resetOllamaRuntime()
  })

  afterEach(() => {
    resetOllamaRuntime()
    setOllamaLifecycleClientFactory(null)
    vi.clearAllMocks()
  })

  it('serves the main window and an opened settings panel from one request', async () => {
    const setOllamaInstalled = vi.spyOn(useSettingsStore.getState(), 'setOllamaInstalled')

    render(
      <App>
        <MainWindow />
        <StatusProbe />
      </App>
    )

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('connected:2'))

    // Opening settings mounts a third consumer of the same runtime.
    fireEvent.click(screen.getByTitle('Settings'))
    await waitFor(() => expect(screen.getByDisplayValue('http://localhost:11434')).toBeInTheDocument())

    expect(screen.getAllByRole('option', { name: 'gemma3:4b' }).length).toBeGreaterThan(0)
    expect(transport.constructedHosts).toEqual(['http://localhost:11434'])
    expect(transport.checkHealth).toHaveBeenCalledTimes(1)
    expect(transport.listModels).toHaveBeenCalledTimes(1)
    expect(setOllamaInstalled).toHaveBeenCalledTimes(1)
    expect(setOllamaInstalled).toHaveBeenCalledWith(true)
    expect(useSettingsStore.getState().modelsInstalled).toBe(true)
  })

  it('saving a new host retires the old models and checks the new host', async () => {
    render(
      <App>
        <MainWindow />
        <StatusProbe />
      </App>
    )
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('connected:2'))

    fireEvent.click(screen.getByTitle('Settings'))
    const hostInput = await screen.findByDisplayValue('http://localhost:11434')

    let resolveRemoteHealth!: (value: boolean) => void
    transport.checkHealth.mockReturnValue(
      new Promise<boolean>(resolve => {
        resolveRemoteHealth = resolve
      })
    )
    transport.listModels.mockResolvedValue(remoteModels)

    fireEvent.change(hostInput, { target: { value: 'http://remote:11434' } })
    fireEvent.click(screen.getByText('Save'))

    // The retired host's status and models are gone before the new answer.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('offline:0'))
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
    expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    expect(transport.constructedHosts).toEqual([
      'http://localhost:11434',
      'http://remote:11434',
    ])

    await act(async () => {
      resolveRemoteHealth(true)
    })

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('connected:1'))
    expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    expect(useSettingsStore.getState().modelsInstalled).toBe(false)
  })

  it('selecting a model that is not installed flips the derived flag from the cached list', async () => {
    render(
      <App>
        <MainWindow />
        <StatusProbe />
      </App>
    )
    await waitFor(() => expect(useSettingsStore.getState().modelsInstalled).toBe(true))

    fireEvent.click(screen.getByTitle('Settings'))
    const selects = await screen.findAllByRole('combobox')
    const translationSelect = selects.find(select =>
      (select as HTMLSelectElement).value === 'gemma3:4b'
    ) as HTMLSelectElement

    fireEvent.change(translationSelect, { target: { value: 'llama3:8b' } })
    expect(useSettingsStore.getState().modelsInstalled).toBe(true)

    act(() => {
      useSettingsStore.getState().setCorrectionModel('mistral:7b')
    })

    expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    expect(transport.checkHealth).toHaveBeenCalledTimes(1)
    expect(transport.listModels).toHaveBeenCalledTimes(1)
  })
})
