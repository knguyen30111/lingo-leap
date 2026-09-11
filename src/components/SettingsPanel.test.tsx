import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'
import enSettings from '../locales/en/settings.json'
import jaSettings from '../locales/ja/settings.json'
import koSettings from '../locales/ko/settings.json'
import viSettings from '../locales/vi/settings.json'
import tauriCapabilities from '../../src-tauri/capabilities/default.json'

// Mock useOllama hook: the adapter always exposes the full lifecycle contract
const mockModels = [
  { name: 'gemma3:4b', size: 1000000, modified_at: '2026-01-01T00:00:00Z' },
  { name: 'llama3:8b', size: 2000000, modified_at: '2026-01-01T00:00:00Z' },
]
const mockCheckConnection = vi.fn()
const mockPullModel = vi.fn()
vi.mock('../hooks/useOllama', () => ({
  useOllama: () => ({
    isConnected: true,
    isChecking: false,
    models: mockModels,
    error: null,
    pull: null,
    checkConnection: mockCheckConnection,
    pullModel: mockPullModel,
    hasModel: (name: string) => mockModels.some(model => model.name === name),
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
        'audio.microphoneDesc':
          'Speech recognition uses your system default microphone. Change it in your operating system sound settings.',
        'audio.systemDefault': 'System default',
        'desktop.alwaysOnTop': 'Always On Top',
        'desktop.alwaysOnTopDesc': 'Keep the window above other windows',
        'desktop.alwaysOnTopApplyError': 'Could not apply always on top',
        'desktop.autoHideAfterCopy': 'Auto Hide After Copy',
        'desktop.autoHideAfterCopyDesc': 'Hide the window after copying output',
        'desktop.autoHideAfterCopyError': 'Could not hide the window after copying',
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
  changeLanguage: vi.fn(),
}))

// Settings must never reach for microphone hardware just to be inspected
const mockGetUserMedia = vi.fn()
const mockEnumerateDevices = vi.fn().mockResolvedValue([])
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
})

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
      alwaysOnTop: false,
      autoHideAfterCopy: false,
    })
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
    onClose.mockClear()
    mockGetUserMedia.mockClear()
    mockEnumerateDevices.mockClear()
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
    it('explains that speech uses the system default microphone', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByText('Microphone')).toBeInTheDocument()
      expect(screen.getByText('System default')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Speech recognition uses your system default microphone. Change it in your operating system sound settings.'
        )
      ).toBeInTheDocument()
    })

    it('offers no microphone selector', () => {
      const { container } = render(<SettingsPanel onClose={onClose} />)

      const selects = screen.getAllByRole('combobox')
      const deviceSelect = selects.find((select) =>
        Array.from(select.querySelectorAll('option')).some((option) =>
          /microphone|mic-/i.test(option.value + option.textContent)
        )
      )

      expect(deviceSelect).toBeUndefined()
      expect(container.textContent).not.toMatch(/no microphones found/i)
    })

    it('requests no microphone permission when settings are opened or focused', () => {
      render(<SettingsPanel onClose={onClose} />)

      screen.getAllByRole('combobox').forEach((select) => fireEvent.focus(select))

      expect(mockGetUserMedia).not.toHaveBeenCalled()
      expect(mockEnumerateDevices).not.toHaveBeenCalled()
    })
  })

  it('stops propagation on modal click', () => {
    render(<SettingsPanel onClose={onClose} />)

    const modal = screen.getByText('Settings').closest('.settings-modal')
    if (modal) {
      const event = new MouseEvent('click', { bubbles: true })
      const stopPropagation = vi.spyOn(event, 'stopPropagation')
      modal.dispatchEvent(event)
      expect(stopPropagation).toHaveBeenCalled()
    }
  })

  it('renders version in footer', () => {
    render(<SettingsPanel onClose={onClose} />)
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument()
  })

  describe('Model fallback options', () => {
    it('shows fallback option when translation model not in list', () => {
      useSettingsStore.setState({ translationModel: 'custom-model:7b' })
      render(<SettingsPanel onClose={onClose} />)

      // The custom model should appear in one of the selects
      expect(screen.getByText('custom-model:7b')).toBeInTheDocument()
    })

    it('shows fallback option when correction model not in list', () => {
      useSettingsStore.setState({ correctionModel: 'another-model:3b' })
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByText('another-model:3b')).toBeInTheDocument()
    })
  })

  describe('Explanation language selector', () => {
    it('changes explanation language', () => {
      render(<SettingsPanel onClose={onClose} />)
      const selects = screen.getAllByRole('combobox')

      // Find the explanation lang select (has 'auto' value and 'Match input language' option)
      const explanationSelect = selects.find((s) => (s as HTMLSelectElement).value === 'auto')

      if (explanationSelect) {
        fireEvent.change(explanationSelect, { target: { value: 'ja' } })
        expect(useSettingsStore.getState().explanationLang).toBe('ja')
      }
    })
  })

  describe('Desktop settings', () => {
    it('renders an accessible always-on-top switch', () => {
      render(<SettingsPanel onClose={onClose} />)

      const toggle = screen.getByRole('switch', { name: 'Always On Top' })
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })

    it('renders an accessible auto-hide switch', () => {
      render(<SettingsPanel onClose={onClose} />)

      const toggle = screen.getByRole('switch', { name: 'Auto Hide After Copy' })
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })

    it('reflects the saved always-on-top value as checked state', () => {
      useSettingsStore.setState({ alwaysOnTop: true })
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByRole('switch', { name: 'Always On Top' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    })

    it('toggles the saved always-on-top preference', () => {
      render(<SettingsPanel onClose={onClose} />)

      fireEvent.click(screen.getByRole('switch', { name: 'Always On Top' }))

      expect(useSettingsStore.getState().alwaysOnTop).toBe(true)
    })

    it('toggles the saved auto-hide preference', () => {
      render(<SettingsPanel onClose={onClose} />)

      fireEvent.click(screen.getByRole('switch', { name: 'Auto Hide After Copy' }))

      expect(useSettingsStore.getState().autoHideAfterCopy).toBe(true)
    })

    it('shows no desktop alert while nothing has failed', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('surfaces a localized alert when always on top cannot be applied', () => {
      useDesktopRuntimeStatusStore.setState({
        alwaysOnTopApplyError: 'window manager refused',
      })
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByRole('alert')).toHaveTextContent('Could not apply always on top')
    })

    it('surfaces a localized alert when the window cannot hide after copying', () => {
      useDesktopRuntimeStatusStore.setState({
        autoHideAfterCopyError: 'hide denied',
      })
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not hide the window after copying'
      )
    })

    it('keeps the saved preference after a failed apply', () => {
      useSettingsStore.setState({ alwaysOnTop: true })
      useDesktopRuntimeStatusStore.setState({
        alwaysOnTopApplyError: 'window manager refused',
      })
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByRole('switch', { name: 'Always On Top' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    })

    it('does not offer a shared-model control', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.queryByText(/same model/i)).not.toBeInTheDocument()
      expect(useSettingsStore.getState()).not.toHaveProperty('useSameModelForBoth')
    })

    it('keeps the translation and correction model selectors independent', () => {
      render(<SettingsPanel onClose={onClose} />)
      const selects = screen.getAllByRole('combobox')
      const modelSelects = selects.filter((select) =>
        Array.from(select.querySelectorAll('option')).some(
          (option) => option.textContent === 'llama3:8b'
        )
      )

      expect(modelSelects).toHaveLength(2)

      fireEvent.change(modelSelects[0], { target: { value: 'llama3:8b' } })

      expect(useSettingsStore.getState().translationModel).toBe('llama3:8b')
      expect(useSettingsStore.getState().correctionModel).toBe('gemma3:4b')
    })

    it('keeps the microphone row read-only at the system default', () => {
      render(<SettingsPanel onClose={onClose} />)

      expect(screen.getByText('System default')).toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: /microphone/i })).not.toBeInTheDocument()
      expect(mockEnumerateDevices).not.toHaveBeenCalled()
      expect(mockGetUserMedia).not.toHaveBeenCalled()
    })
  })

  describe('Desktop settings contract', () => {
    const desktopKeys = [
      'alwaysOnTop',
      'alwaysOnTopDesc',
      'alwaysOnTopApplyError',
      'autoHideAfterCopy',
      'autoHideAfterCopyDesc',
      'autoHideAfterCopyError',
    ] as const

    it.each([
      ['en', enSettings],
      ['ja', jaSettings],
      ['ko', koSettings],
      ['vi', viSettings],
    ])('localizes every desktop setting string in %s', (_locale, bundle) => {
      const desktop = (bundle as Record<string, unknown>).desktop as
        | Record<string, string>
        | undefined
      expect(desktop).toBeDefined()
      for (const key of desktopKeys) {
        expect(typeof desktop?.[key]).toBe('string')
        expect(desktop?.[key]?.length ?? 0).toBeGreaterThan(0)
      }
    })

    it('grants the exact window permissions the desktop settings need', () => {
      const permissions = tauriCapabilities.permissions as string[]
      expect(permissions).toContain('core:window:allow-set-always-on-top')
      expect(permissions).toContain('core:window:allow-hide')
      expect(tauriCapabilities.windows).toContain('main')
      expect(permissions.filter((p) => p.startsWith('core:window:'))).toEqual([
        'core:window:allow-set-always-on-top',
        'core:window:allow-hide',
      ])
    })
  })

  describe('UI language selector', () => {
    it('changes UI language', () => {
      render(<SettingsPanel onClose={onClose} />)
      const selects = screen.getAllByRole('combobox')

      // Find the UI language select (has English as an option)
      const uiLangSelect = selects.find((s) => {
        const options = s.querySelectorAll('option')
        return Array.from(options).some((o) => o.textContent === 'English')
      })

      if (uiLangSelect) {
        fireEvent.change(uiLangSelect, { target: { value: 'vi' } })
        expect(useSettingsStore.getState().uiLanguage).toBe('vi')
      }
    })
  })
})
