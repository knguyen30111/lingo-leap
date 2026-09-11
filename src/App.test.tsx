import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import App from './App'
import { changeLanguage } from './i18n'
import { useTheme } from './hooks/useTheme'
import { useOllamaLifecycle } from './hooks/useOllama'
import { usePersistedSettingsRuntime } from './hooks/usePersistedSettingsRuntime'
import { useSettingsStore } from './stores/settingsStore'
import { useAppStore } from './stores/appStore'
import { useDesktopRuntimeStatusStore } from './stores/desktop-runtime-status-store'
import { resetOllamaRuntime } from './stores/ollamaStore'

const { useTranslationMock } = vi.hoisted(() => ({ useTranslationMock: vi.fn() }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: useTranslationMock,
}))

// The shell delegates language application to i18n; App owns only the call.
vi.mock('./i18n', () => ({ changeLanguage: vi.fn() }))

// These hooks belong to #54/#69 and have their own behavior suites. App is
// responsible only for mounting them, so here they are inert call recorders.
vi.mock('./hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('./hooks/useOllama', () => ({ useOllamaLifecycle: vi.fn() }))
vi.mock('./hooks/usePersistedSettingsRuntime', () => ({
  usePersistedSettingsRuntime: vi.fn(),
}))

// The routes are stubbed so an assertion can only be about which route App
// chose, never about what the destination screen happens to render.
vi.mock('./components/MainWindow', () => ({
  MainWindow: () => createElement('div', { 'data-testid': 'main-window' }),
}))
vi.mock('./components/SetupWizard', () => ({
  SetupWizard: () => createElement('div', { 'data-testid': 'setup-wizard' }),
}))

const LOADING_TEXT = 'Loading translated copy'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTranslationMock.mockReturnValue({
      t: (key: string) => (key === 'loading' ? LOADING_TEXT : key),
    })
    localStorage.clear()
    resetOllamaRuntime()
    useAppStore.getState().reset()
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
    useSettingsStore.setState({
      isSetupComplete: false,
      ollamaInstalled: false,
      uiLanguage: 'en',
      theme: 'system',
    })
  })

  describe('pre-effect loading state', () => {
    // Server rendering is the deterministic pre-effect seam: React never runs
    // effects on the server, so `mounted` is observably false without racing
    // a client effect that would immediately flip it.
    it('shows the translated loading copy before effects can run', () => {
      useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: true })

      const markup = renderToString(createElement(App))

      expect(markup).toContain(LOADING_TEXT)
    })

    it('withholds the ready route until effects have run', () => {
      // Setup is complete, so anything other than loading would mean App
      // routed on state it is not yet allowed to trust.
      useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: true })

      const markup = renderToString(createElement(App))

      expect(markup).not.toContain('main-window')
      expect(markup).not.toContain('setup-wizard')
    })

    it('reads its loading copy from the common namespace', () => {
      renderToString(createElement(App))

      expect(useTranslationMock).toHaveBeenCalledWith('common')
    })
  })

  describe('runtime hook mounting', () => {
    it('mounts the theme system', async () => {
      render(createElement(App))

      await screen.findByTestId('setup-wizard')
      expect(vi.mocked(useTheme)).toHaveBeenCalled()
    })

    it('mounts the single Ollama lifecycle runtime', async () => {
      render(createElement(App))

      await screen.findByTestId('setup-wizard')
      expect(vi.mocked(useOllamaLifecycle)).toHaveBeenCalled()
    })

    it('mounts the persisted desktop settings runtime', async () => {
      render(createElement(App))

      await screen.findByTestId('setup-wizard')
      expect(vi.mocked(usePersistedSettingsRuntime)).toHaveBeenCalled()
    })
  })

  describe('UI language sync', () => {
    it('applies the stored language on mount', async () => {
      useSettingsStore.setState({ uiLanguage: 'ja' })

      render(createElement(App))

      await waitFor(() => {
        expect(vi.mocked(changeLanguage)).toHaveBeenCalledWith('ja')
      })
    })

    it('re-applies when the store language changes, without the store action', async () => {
      render(createElement(App))
      await screen.findByTestId('setup-wizard')

      // Clearing first means the next call can only come from App reacting to
      // the new store value, not from the mount-time application above.
      vi.mocked(changeLanguage).mockClear()

      act(() => {
        useSettingsStore.setState({ uiLanguage: 'ja' })
      })

      await waitFor(() => {
        expect(vi.mocked(changeLanguage)).toHaveBeenCalledWith('ja')
      })
      expect(vi.mocked(changeLanguage)).toHaveBeenCalledTimes(1)
    })

    it('does not re-apply when an unrelated setting changes', async () => {
      render(createElement(App))
      await screen.findByTestId('setup-wizard')
      vi.mocked(changeLanguage).mockClear()

      act(() => {
        useSettingsStore.setState({ theme: 'dark' })
      })

      await waitFor(() => {
        expect(useSettingsStore.getState().theme).toBe('dark')
      })
      expect(vi.mocked(changeLanguage)).not.toHaveBeenCalled()
    })
  })

  describe('routing', () => {
    it('routes to the setup wizard when setup is incomplete', async () => {
      useSettingsStore.setState({ isSetupComplete: false, ollamaInstalled: true })

      render(createElement(App))

      expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument()
      expect(screen.queryByTestId('main-window')).not.toBeInTheDocument()
    })

    it('routes to the setup wizard when setup is complete but Ollama is missing', async () => {
      useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: false })

      render(createElement(App))

      expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument()
      expect(screen.queryByTestId('main-window')).not.toBeInTheDocument()
    })

    it('routes to the main window once setup is complete and Ollama is installed', async () => {
      useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: true })

      render(createElement(App))

      expect(await screen.findByTestId('main-window')).toBeInTheDocument()
      expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument()
    })

    it('leaves the main window for the setup wizard when Ollama goes missing', async () => {
      useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: true })

      render(createElement(App))
      await screen.findByTestId('main-window')

      act(() => {
        useSettingsStore.setState({ ollamaInstalled: false })
      })

      expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument()
      expect(screen.queryByTestId('main-window')).not.toBeInTheDocument()
    })
  })
})
