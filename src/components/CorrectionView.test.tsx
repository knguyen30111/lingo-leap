import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CorrectionView } from './CorrectionView'
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

// Mock useSpeechToText hook
vi.mock('../hooks/useSpeechToText', () => ({
  useSpeechToText: () => ({
    isListening: false,
    isSupported: true,
    transcript: '',
    interimTranscript: '',
    silenceDetected: false,
    toggleListening: vi.fn(),
  }),
}))

// Mock child components
vi.mock('./LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector">LanguageSelector</div>,
}))

vi.mock('./CorrectionTabs', () => ({
  CorrectionTabs: () => <div data-testid="correction-tabs">CorrectionTabs</div>,
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
    })
    mockCorrect.mockClear()
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
})
