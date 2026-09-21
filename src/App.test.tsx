import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { useSettingsStore } from './stores/settingsStore'

vi.mock('./components/MainWindow', () => ({
  MainWindow: () => <div data-testid="main-window" />,
}))

vi.mock('./components/SetupWizard', () => ({
  SetupWizard: () => <div data-testid="setup-wizard" />,
}))

vi.mock('./hooks/useTheme', () => ({
  useTheme: vi.fn(),
}))

vi.mock('./i18n', () => ({
  changeLanguage: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('App routing', () => {
  beforeEach(() => {
    useSettingsStore.setState({ isSetupComplete: false, ollamaInstalled: false })
  })

  it('shows the setup wizard before onboarding is completed', async () => {
    render(<App />)
    expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument()
  })

  it('shows the main window once onboarding is complete', async () => {
    useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: true })
    render(<App />)
    expect(await screen.findByTestId('main-window')).toBeInTheDocument()
  })

  // Regression: a failed health check writes ollamaInstalled=false and persists
  // it. When that flag also gated the main window, losing Ollama stranded an
  // onboarded user in the wizard - which has no route to Settings - so a bad
  // host could not be corrected, and the lockout survived a restart.
  it('keeps an onboarded user in the main window when Ollama is unreachable', async () => {
    useSettingsStore.setState({ isSetupComplete: true, ollamaInstalled: false })
    render(<App />)

    expect(await screen.findByTestId('main-window')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument()
  })
})
