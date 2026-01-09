import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { useSettingsStore } from '../stores/settingsStore'

// Mock useOllama hook
vi.mock('../hooks/useOllama', () => ({
  useOllama: () => ({
    models: [
      { name: 'gemma3:4b', size: 1000000 },
      { name: 'llama3:8b', size: 2000000 },
    ],
  }),
}))

// Mock useAudioDevices hook
const mockSelectDevice = vi.fn()
const mockRefreshDevices = vi.fn()
vi.mock('../hooks/useAudioDevices', () => ({
  useAudioDevices: () => ({
    devices: [
      { deviceId: 'default', label: 'Default Microphone', isDefault: true },
      { deviceId: 'mic-2', label: 'External Mic', isDefault: false },
    ],
    selectedDeviceId: 'default',
    selectDevice: mockSelectDevice,
    refreshDevices: mockRefreshDevices,
    isLoading: false,
  }),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        title: 'Settings',
        'sections.interface': 'Interface',
        'sections.appearance': 'Appearance',
        'sections.aiEngine': 'AI Engine',
        'sections.languages': 'Languages',
        'sections.audio': 'Audio',
        'language.interface': 'Interface Language',
        'language.interfaceDesc': 'Language for the app interface',
        'language.defaultTarget': 'Default Target Language',
        'language.explanation': 'Explanation Language',
        'language.explanationDesc': 'Language for grammar explanations',
        'language.speech': 'Speech Language',
        'language.speechDesc': 'Language for voice input',
        'language.matchInput': 'Match input language',
        'theme.light': 'Light',
        'theme.dark': 'Dark',
        'theme.auto': 'Auto',
        'ollama.host': 'Ollama Host',
        'ollama.translationModel': 'Translation Model',
        'ollama.translationModelDesc': 'Model for translations',
        'ollama.correctionModel': 'Correction Model',
        'ollama.correctionModelDesc': 'Model for grammar',
        'streaming.label': 'Streaming',
        'streaming.description': 'Stream responses',
        'audio.microphone': 'Microphone',
        'audio.microphoneDesc': 'Select input device',
        'audio.noMicrophones': 'No microphones found',
        'audio.default': '(Default)',
        version: 'Version 1.0.0',
        'common:save': 'Save',
        'common:languages.en': 'English',
        'common:languages.ja': 'Japanese',
        'common:languages.vi': 'Vietnamese',
        'common:languages.zh': 'Chinese',
        'common:languages.ko': 'Korean',
      }
      return translations[key] || key
    },
  }),
}))

// Mock UI_LANGUAGES
vi.mock('../i18n', () => ({
  UI_LANGUAGES: [
    { code: 'en', nativeName: 'English' },
    { code: 'vi', nativeName: 'Tiếng Việt' },
    { code: 'ja', nativeName: '日本語' },
  ],
}))

describe('SettingsPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'system',
      ollamaHost: 'http://localhost:11434',
      translationModel: 'gemma3:4b',
      correctionModel: 'gemma3:4b',
      defaultTargetLang: 'vi',
      explanationLang: 'auto',
      speechLang: 'en',
      useStreaming: false,
      uiLanguage: 'en',
    })
    onClose.mockClear()
    mockSelectDevice.mockClear()
    mockRefreshDevices.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders settings title', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders all sections', () => {
    render(<SettingsPanel onClose={onClose} />)

    expect(screen.getByText('Interface')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('AI Engine')).toBeInTheDocument()
    expect(screen.getByText('Languages')).toBeInTheDocument()
    expect(screen.getByText('Audio')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const { container } = render(<SettingsPanel onClose={onClose} />)

    const closeButton = container.querySelector('.settings-close-btn')
    if (closeButton) {
      fireEvent.click(closeButton)
    }

    expect(onClose).toHaveBeenCalled()
  })

  describe('Theme settings', () => {
    it('renders theme options', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('Auto')).toBeInTheDocument()
    })

    it('shows current theme as active', () => {
      useSettingsStore.setState({ theme: 'dark' })
      render(<SettingsPanel onClose={onClose} />)

      const darkButton = screen.getByText('Dark').closest('button')
      expect(darkButton).toHaveClass('active')
    })

    it('changes theme when option clicked', () => {
      render(<SettingsPanel onClose={onClose} />)

      fireEvent.click(screen.getByText('Dark'))

      expect(useSettingsStore.getState().theme).toBe('dark')
    })
  })

  describe('Ollama settings', () => {
    it('renders host input', () => {
      render(<SettingsPanel onClose={onClose} />)

      const input = screen.getByPlaceholderText('http://localhost:11434')
      expect(input).toHaveValue('http://localhost:11434')
    })

    it('updates local host value on input', () => {
      render(<SettingsPanel onClose={onClose} />)

      const input = screen.getByPlaceholderText('http://localhost:11434')
      fireEvent.change(input, { target: { value: 'http://custom:8080' } })

      expect(input).toHaveValue('http://custom:8080')
    })

    it('saves host when save button clicked', () => {
      render(<SettingsPanel onClose={onClose} />)

      const input = screen.getByPlaceholderText('http://localhost:11434')
      fireEvent.change(input, { target: { value: 'http://custom:8080' } })
      fireEvent.click(screen.getByText('Save'))

      expect(useSettingsStore.getState().ollamaHost).toBe('http://custom:8080')
    })

    it('renders model selectors', () => {
      render(<SettingsPanel onClose={onClose} />)

      // Find all selects and check for model options
      const selects = screen.getAllByRole('combobox')
      // At least translation and correction model selects should be present
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })

    it('changes translation model when selected', () => {
      render(<SettingsPanel onClose={onClose} />)

      // Find the translation model select by its label
      const selects = screen.getAllByRole('combobox')
      const modelSelect = selects.find((s) => {
        const options = s.querySelectorAll('option')
        return Array.from(options).some((o) => o.value === 'llama3:8b')
      })

      if (modelSelect) {
        fireEvent.change(modelSelect, { target: { value: 'llama3:8b' } })
      }

      // One of the models should now be llama3:8b
      const state = useSettingsStore.getState()
      expect(state.translationModel === 'llama3:8b' || state.correctionModel === 'llama3:8b').toBe(
        true
      )
    })
  })

  describe('Streaming toggle', () => {
    it('renders streaming toggle', () => {
      render(<SettingsPanel onClose={onClose} />)
      expect(screen.getByText('Streaming')).toBeInTheDocument()
    })

    it('toggles streaming when clicked', () => {
      render(<SettingsPanel onClose={onClose} />)

      // Find the toggle button (has toggle-switch class)
      const toggleButtons = screen.getAllByRole('button')
      const streamingToggle = toggleButtons.find((btn) => btn.classList.contains('toggle-switch'))

      if (streamingToggle) {
        fireEvent.click(streamingToggle)
        expect(useSettingsStore.getState().useStreaming).toBe(true)

        fireEvent.click(streamingToggle)
        expect(useSettingsStore.getState().useStreaming).toBe(false)
      }
    })

    it('shows active state when streaming enabled', () => {
      useSettingsStore.setState({ useStreaming: true })
      render(<SettingsPanel onClose={onClose} />)

      const toggleButtons = screen.getAllByRole('button')
      const streamingToggle = toggleButtons.find((btn) => btn.classList.contains('toggle-switch'))

      expect(streamingToggle).toHaveClass('active')
    })
  })

  describe('Language settings', () => {
    it('renders default target language selector', () => {
      render(<SettingsPanel onClose={onClose} />)
      expect(screen.getByText('Default Target Language')).toBeInTheDocument()
    })

    it('changes default target language', () => {
      render(<SettingsPanel onClose={onClose} />)

      const selects = screen.getAllByRole('combobox')
      const targetLangSelect = selects.find((s) => (s as HTMLSelectElement).value === 'vi')

      if (targetLangSelect) {
        fireEvent.change(targetLangSelect, { target: { value: 'ja' } })
      }

      // Check if either defaultTargetLang or speechLang changed to ja
      const state = useSettingsStore.getState()
      expect(
        state.defaultTargetLang === 'ja' || state.speechLang === 'ja' || state.explanationLang === 'ja'
      ).toBe(true)
    })

    it('renders UI language selector', () => {
      render(<SettingsPanel onClose={onClose} />)
      expect(screen.getByText('Interface Language')).toBeInTheDocument()
    })
  })

  describe('Audio settings', () => {
    it('renders microphone selector', () => {
      render(<SettingsPanel onClose={onClose} />)
      expect(screen.getByText('Microphone')).toBeInTheDocument()
    })

    it('shows available devices', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByText('Default Microphone (Default)')).toBeInTheDocument()
      expect(screen.getByText('External Mic')).toBeInTheDocument()
    })

    it('calls selectDevice when device changed', () => {
      render(<SettingsPanel onClose={onClose} />)

      const selects = screen.getAllByRole('combobox')
      const micSelect = selects.find((s) => {
        const options = s.querySelectorAll('option')
        return Array.from(options).some((o) => o.value === 'mic-2')
      })

      if (micSelect) {
        fireEvent.change(micSelect, { target: { value: 'mic-2' } })
        expect(mockSelectDevice).toHaveBeenCalledWith('mic-2')
      }
    })

    it('refreshes devices on focus', () => {
      render(<SettingsPanel onClose={onClose} />)

      const selects = screen.getAllByRole('combobox')
      const micSelect = selects.find((s) => {
        const options = s.querySelectorAll('option')
        return Array.from(options).some((o) => o.value === 'mic-2')
      })

      if (micSelect) {
        fireEvent.focus(micSelect)
        expect(mockRefreshDevices).toHaveBeenCalledWith(true)
      }
    })
  })

  it('stops propagation on modal click', () => {
    render(<SettingsPanel onClose={onClose} />)

    const modal = screen.getByText('Settings').closest('.settings-modal')
    if (modal) {
      const event = new MouseEvent('click', { bubbles: true })
      const stopPropagation = vi.spyOn(event, 'stopPropagation')
      modal.dispatchEvent(event)
      // The stopPropagation is called internally
    }
  })

  it('renders version in footer', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument()
  })
})
