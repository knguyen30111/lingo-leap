import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SetupWizard } from './SetupWizard'
import { useSettingsStore } from '../stores/settingsStore'

// Mock useOllama hook
const mockCheckConnection = vi.fn()
const mockHasModel = vi.fn()
vi.mock('../hooks/useOllama', () => ({
  useOllama: () => ({
    isConnected: mockOllamaState.isConnected,
    isChecking: mockOllamaState.isChecking,
    checkConnection: mockCheckConnection,
    models: mockOllamaState.models,
    hasModel: mockHasModel,
  }),
}))

// Mock CopyButton component
vi.mock('./CopyButton', () => ({
  CopyButton: ({ text }: { text: string }) => (
    <button data-testid={`copy-${text}`}>Copy</button>
  ),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        welcome: 'Welcome to Lingo Leap',
        subtitle: 'Let\'s set up your translation engine',
        'ollama.checking': 'Checking Ollama...',
        'ollama.connected': 'Ollama Connected',
        'ollama.notFound': 'Ollama Not Found',
        'ollama.pleaseWait': 'Please wait',
        'ollama.installToContinue': 'Install Ollama to continue',
        'models.title': 'Required Models',
        'models.checking': 'Checking...',
        'models.installed': 'Installed',
        'models.notFound': 'Not Found',
        'models.missing': 'Please install missing models',
        'buttons.downloadOllama': 'Download Ollama',
        'buttons.getStarted': 'Get Started',
        'buttons.installModelsFirst': 'Install Models First',
        'buttons.skipSetup': 'Skip Setup',
        'common:retry': 'Retry',
        'common:refresh': 'Refresh',
        'instructions.title': 'Setup Instructions',
        'instructions.step1': 'Download and install Ollama from',
        'instructions.downloadTranslation': 'Download translation model:',
        'instructions.downloadGrammar': 'Download grammar model:',
      }
      return translations[key] || key
    },
  }),
}))

// State mock for useOllama
const mockOllamaState = {
  isConnected: false,
  isChecking: false,
  models: [] as { name: string; size: number }[],
}

describe('SetupWizard', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      setupComplete: false,
      translationModel: 'gemma3:4b',
      correctionModel: 'gemma3:4b',
    })

    // Reset mock state
    mockOllamaState.isConnected = false
    mockOllamaState.isChecking = false
    mockOllamaState.models = []

    mockCheckConnection.mockClear()
    mockHasModel.mockReset()
    mockHasModel.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders welcome message', () => {
    render(<SetupWizard />)
    expect(screen.getByText('Welcome to Lingo Leap')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<SetupWizard />)
    expect(screen.getByText("Let's set up your translation engine")).toBeInTheDocument()
  })

  describe('Ollama not connected', () => {
    it('shows "Not Found" status', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Ollama Not Found')).toBeInTheDocument()
    })

    it('shows install message', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Install Ollama to continue')).toBeInTheDocument()
    })

    it('renders download Ollama link', () => {
      render(<SetupWizard />)
      const link = screen.getByText('Download Ollama')
      expect(link).toHaveAttribute('href', 'https://ollama.com/download')
      expect(link).toHaveAttribute('target', '_blank')
    })

    it('renders retry button', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('calls checkConnection when retry clicked', () => {
      render(<SetupWizard />)

      fireEvent.click(screen.getByText('Retry'))

      expect(mockCheckConnection).toHaveBeenCalled()
    })

    it('does not show model status section', () => {
      render(<SetupWizard />)
      expect(screen.queryByText('Required Models')).not.toBeInTheDocument()
    })
  })

  describe('Ollama checking', () => {
    beforeEach(() => {
      mockOllamaState.isChecking = true
    })

    it('shows checking status', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Checking Ollama...')).toBeInTheDocument()
    })

    it('shows please wait message', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Please wait')).toBeInTheDocument()
    })

    it('does not show retry button while checking', () => {
      render(<SetupWizard />)
      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })
  })

  describe('Ollama connected', () => {
    beforeEach(() => {
      mockOllamaState.isConnected = true
      mockOllamaState.models = [
        { name: 'gemma3:4b', size: 1000000 },
        { name: 'llama3:8b', size: 2000000 },
      ]
    })

    it('shows connected status', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Ollama Connected')).toBeInTheDocument()
    })

    it('shows model count', () => {
      render(<SetupWizard />)
      expect(screen.getByText('2 models available')).toBeInTheDocument()
    })

    it('shows "1 model" for single model', () => {
      mockOllamaState.models = [{ name: 'gemma3:4b', size: 1000000 }]
      render(<SetupWizard />)
      expect(screen.getByText('1 model available')).toBeInTheDocument()
    })

    it('shows Required Models section', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Required Models')).toBeInTheDocument()
    })

    it('shows model status indicators', () => {
      render(<SetupWizard />)
      expect(screen.getByText('gemma3 (Translation)')).toBeInTheDocument()
      expect(screen.getByText('gemma3 (Grammar)')).toBeInTheDocument()
    })

    describe('models not installed', () => {
      it('shows missing models warning', () => {
        render(<SetupWizard />)
        expect(screen.getByText('Please install missing models')).toBeInTheDocument()
      })

      it('disables Get Started button', () => {
        render(<SetupWizard />)
        expect(screen.getByText('Install Models First')).toBeDisabled()
      })

      it('shows Refresh button', () => {
        render(<SetupWizard />)
        expect(screen.getByText('Refresh')).toBeInTheDocument()
      })

      it('calls checkConnection when Refresh clicked', () => {
        render(<SetupWizard />)

        fireEvent.click(screen.getByText('Refresh'))

        expect(mockCheckConnection).toHaveBeenCalled()
      })
    })

    describe('all models installed', () => {
      beforeEach(() => {
        mockHasModel.mockReturnValue(true)
      })

      it('enables Get Started button', () => {
        render(<SetupWizard />)
        expect(screen.getByText('Get Started')).not.toBeDisabled()
      })

      it('sets setupComplete when Get Started clicked', () => {
        const setSetupComplete = vi.spyOn(useSettingsStore.getState(), 'setSetupComplete')
        render(<SetupWizard />)

        act(() => {
          fireEvent.click(screen.getByText('Get Started'))
        })

        expect(setSetupComplete).toHaveBeenCalledWith(true)
      })

      it('does not show missing models warning', () => {
        render(<SetupWizard />)
        expect(screen.queryByText('Please install missing models')).not.toBeInTheDocument()
      })

      it('does not show Refresh button when all models installed', () => {
        render(<SetupWizard />)
        expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
      })
    })
  })

  describe('Skip setup', () => {
    it('renders skip button', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Skip Setup')).toBeInTheDocument()
    })

    it('sets setupComplete when skip clicked', () => {
      const setSetupComplete = vi.spyOn(useSettingsStore.getState(), 'setSetupComplete')
      render(<SetupWizard />)

      act(() => {
        fireEvent.click(screen.getByText('Skip Setup'))
      })

      expect(setSetupComplete).toHaveBeenCalledWith(true)
    })
  })

  describe('Instructions', () => {
    it('renders setup instructions title', () => {
      render(<SetupWizard />)
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument()
    })

    it('renders step 1 with ollama link', () => {
      render(<SetupWizard />)

      const link = screen.getByText('ollama.com')
      expect(link).toHaveAttribute('href', 'https://ollama.com/download')
    })

    it('renders ollama pull commands', () => {
      render(<SetupWizard />)

      // Both translation and correction models show the same command
      const commands = screen.getAllByText('ollama pull gemma3:4b')
      expect(commands.length).toBe(2)
    })

    it('renders copy buttons for commands', () => {
      render(<SetupWizard />)

      // Both translation and correction models have copy buttons
      const copyButtons = screen.getAllByTestId('copy-ollama pull gemma3:4b')
      expect(copyButtons.length).toBe(2)
    })
  })

  describe('Model status indicator', () => {
    beforeEach(() => {
      mockOllamaState.isConnected = true
      mockOllamaState.models = [{ name: 'gemma3:4b', size: 1000000 }]
    })

    it('shows checking state with pulse animation', () => {
      mockOllamaState.isChecking = true
      render(<SetupWizard />)

      // The status-dot with checking state should have animate-pulse class
      const statusDots = document.querySelectorAll('.status-dot')
      const checkingDot = Array.from(statusDots).find((dot) =>
        dot.classList.contains('animate-pulse')
      )
      expect(checkingDot).toBeTruthy()
    })

    it('shows installed status for available model', () => {
      mockHasModel.mockImplementation((name: string) => name.includes('gemma3'))
      render(<SetupWizard />)

      expect(screen.getAllByText('Installed').length).toBeGreaterThan(0)
    })

    it('shows not found status for missing model', () => {
      mockHasModel.mockReturnValue(false)
      render(<SetupWizard />)

      expect(screen.getAllByText('Not Found').length).toBeGreaterThan(0)
    })
  })
})
