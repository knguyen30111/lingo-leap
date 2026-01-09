import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainWindow } from './MainWindow'
import { useAppStore } from '../stores/appStore'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common:appName': 'Lingo Leap',
        'status.connected': 'Connected',
        'status.checking': 'Checking connection...',
        'status.notConnected': 'Not connected',
        'status.disabled': 'Disabled',
        'settings:title': 'Settings',
        'errors.ollamaConnection': 'Cannot connect to Ollama',
        'common:retry': 'Retry',
      }
      return translations[key] || key
    },
  }),
}))

// Mock useOllama hook
const mockCheckConnection = vi.fn()
vi.mock('../hooks/useOllama', () => ({
  useOllama: () => ({
    isConnected: mockOllamaState.isConnected,
    isChecking: mockOllamaState.isChecking,
    checkConnection: mockCheckConnection,
  }),
}))

// Mock child components
vi.mock('./ModeSelector', () => ({
  ModeSelector: () => <div data-testid="mode-selector">ModeSelector</div>,
}))

vi.mock('./TranslationView', () => ({
  TranslationView: () => <div data-testid="translation-view">TranslationView</div>,
}))

vi.mock('./CorrectionView', () => ({
  CorrectionView: () => <div data-testid="correction-view">CorrectionView</div>,
}))

vi.mock('./SettingsPanel', () => ({
  SettingsPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="settings-panel">
      <button onClick={onClose} data-testid="close-settings">Close</button>
    </div>
  ),
}))

const mockOllamaState = {
  isConnected: true,
  isChecking: false,
}

describe('MainWindow', () => {
  beforeEach(() => {
    useAppStore.setState({
      mode: 'translate',
      isEnabled: true,
    })
    mockOllamaState.isConnected = true
    mockOllamaState.isChecking = false
    mockCheckConnection.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders app name in header', () => {
    render(<MainWindow />)
    expect(screen.getByText('Lingo Leap')).toBeInTheDocument()
  })

  it('renders mode selector', () => {
    render(<MainWindow />)
    expect(screen.getByTestId('mode-selector')).toBeInTheDocument()
  })

  it('renders settings button', () => {
    render(<MainWindow />)
    expect(screen.getByTitle('Settings')).toBeInTheDocument()
  })

  it('renders TranslationView in translate mode', () => {
    render(<MainWindow />)
    expect(screen.getByTestId('translation-view')).toBeInTheDocument()
    expect(screen.queryByTestId('correction-view')).not.toBeInTheDocument()
  })

  it('renders CorrectionView in correct mode', () => {
    useAppStore.setState({ mode: 'correct' })
    render(<MainWindow />)
    expect(screen.getByTestId('correction-view')).toBeInTheDocument()
    expect(screen.queryByTestId('translation-view')).not.toBeInTheDocument()
  })

  it('opens settings panel when settings button clicked', () => {
    render(<MainWindow />)

    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Settings'))

    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })

  it('closes settings panel when close clicked', () => {
    render(<MainWindow />)

    fireEvent.click(screen.getByTitle('Settings'))
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('close-settings'))
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument()
  })

  describe('Status indicator', () => {
    it('shows success status when connected', () => {
      mockOllamaState.isConnected = true
      const { container } = render(<MainWindow />)
      expect(container.querySelector('.status-dot.success')).toBeInTheDocument()
    })

    it('shows warning status when checking', () => {
      mockOllamaState.isConnected = false
      mockOllamaState.isChecking = true
      const { container } = render(<MainWindow />)
      expect(container.querySelector('.status-dot.warning')).toBeInTheDocument()
    })

    it('shows error status when not connected', () => {
      mockOllamaState.isConnected = false
      mockOllamaState.isChecking = false
      const { container } = render(<MainWindow />)
      expect(container.querySelector('.status-dot.error')).toBeInTheDocument()
    })

    it('shows inactive status when disabled', () => {
      useAppStore.setState({ isEnabled: false })
      const { container } = render(<MainWindow />)
      expect(container.querySelector('.status-dot.inactive')).toBeInTheDocument()
    })
  })

  describe('Connection warning banner', () => {
    it('shows warning when not connected', () => {
      mockOllamaState.isConnected = false
      render(<MainWindow />)
      expect(screen.getByText('Cannot connect to Ollama')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('calls checkConnection when retry clicked', () => {
      mockOllamaState.isConnected = false
      render(<MainWindow />)

      fireEvent.click(screen.getByText('Retry'))

      expect(mockCheckConnection).toHaveBeenCalled()
    })

    it('does not show warning when connected', () => {
      mockOllamaState.isConnected = true
      render(<MainWindow />)
      expect(screen.queryByText('Cannot connect to Ollama')).not.toBeInTheDocument()
    })

    it('does not show warning when checking', () => {
      mockOllamaState.isConnected = false
      mockOllamaState.isChecking = true
      render(<MainWindow />)
      expect(screen.queryByText('Cannot connect to Ollama')).not.toBeInTheDocument()
    })
  })

  describe('Checking banner', () => {
    it('shows checking message when checking', () => {
      mockOllamaState.isChecking = true
      render(<MainWindow />)
      expect(screen.getByText('Checking connection...')).toBeInTheDocument()
    })

    it('does not show checking when connected', () => {
      mockOllamaState.isConnected = true
      mockOllamaState.isChecking = false
      render(<MainWindow />)
      expect(screen.queryByText('Checking connection...')).not.toBeInTheDocument()
    })
  })

  it('has correct layout structure', () => {
    const { container } = render(<MainWindow />)
    expect(container.querySelector('.glass-header')).toBeInTheDocument()
    expect(container.querySelector('main')).toBeInTheDocument()
  })
})
