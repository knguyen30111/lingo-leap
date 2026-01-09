import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSelector } from './LanguageSelector'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        explainIn: 'Explain in',
        sameAsInput: 'Same as input',
        swapLanguages: 'Swap languages',
      }
      return translations[key] || key
    },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

// Mock SUPPORTED_LANGUAGES
vi.mock('../lib/language', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'auto', name: 'Auto', nativeName: 'Auto-detect' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  ],
}))

describe('LanguageSelector', () => {
  beforeEach(() => {
    useAppStore.setState({
      mode: 'translate',
      sourceLang: 'en',
      targetLang: 'vi',
      inputText: 'Hello',
      outputText: 'Xin chào',
    })

    useSettingsStore.setState({
      explanationLang: 'auto',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Translate mode', () => {
    it('renders swap button in translate mode', () => {
      render(<LanguageSelector />)

      expect(screen.getByTitle('Swap languages')).toBeInTheDocument()
    })

    it('swaps source and target languages when clicked', () => {
      render(<LanguageSelector />)

      fireEvent.click(screen.getByTitle('Swap languages'))

      expect(useAppStore.getState().sourceLang).toBe('vi')
      expect(useAppStore.getState().targetLang).toBe('en')
    })

    it('swaps input and output text when clicked', () => {
      render(<LanguageSelector />)

      fireEvent.click(screen.getByTitle('Swap languages'))

      expect(useAppStore.getState().inputText).toBe('Xin chào')
      expect(useAppStore.getState().outputText).toBe('Hello')
    })

    it('disables swap button when source is auto', () => {
      useAppStore.setState({ sourceLang: 'auto' })
      render(<LanguageSelector />)

      expect(screen.getByTitle('Swap languages')).toBeDisabled()
    })

    it('does not swap when source is auto', () => {
      useAppStore.setState({ sourceLang: 'auto' })
      render(<LanguageSelector />)

      fireEvent.click(screen.getByTitle('Swap languages'))

      // Should remain unchanged
      expect(useAppStore.getState().sourceLang).toBe('auto')
    })

    it('does not swap text when output is empty', () => {
      useAppStore.setState({ outputText: '' })
      render(<LanguageSelector />)

      fireEvent.click(screen.getByTitle('Swap languages'))

      // Languages swap but text doesn't
      expect(useAppStore.getState().sourceLang).toBe('vi')
      expect(useAppStore.getState().targetLang).toBe('en')
      expect(useAppStore.getState().inputText).toBe('Hello')
      expect(useAppStore.getState().outputText).toBe('')
    })

    it('toggles rotation class on click', () => {
      render(<LanguageSelector />)

      const button = screen.getByTitle('Swap languages')
      expect(button).toHaveClass('rotate-0')

      fireEvent.click(button)
      expect(button).toHaveClass('rotate-180')

      fireEvent.click(button)
      expect(button).toHaveClass('rotate-0')
    })

    it('has lang-swap-button class', () => {
      render(<LanguageSelector />)
      expect(screen.getByTitle('Swap languages')).toHaveClass('lang-swap-button')
    })
  })

  describe('Correct mode', () => {
    beforeEach(() => {
      useAppStore.setState({ mode: 'correct' })
    })

    it('renders explanation language selector', () => {
      render(<LanguageSelector />)

      expect(screen.getByText('Explain in')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('shows "Same as input" option for auto', () => {
      render(<LanguageSelector />)

      expect(screen.getByText('Same as input')).toBeInTheDocument()
    })

    it('shows language options', () => {
      render(<LanguageSelector />)

      expect(screen.getByText('English')).toBeInTheDocument()
      expect(screen.getByText('Tiếng Việt')).toBeInTheDocument()
      expect(screen.getByText('日本語')).toBeInTheDocument()
    })

    it('does not show auto in language options', () => {
      render(<LanguageSelector />)

      // Auto should not be in the options (only "Same as input")
      const options = screen.getAllByRole('option')
      const autoOption = options.find((opt) => opt.textContent === 'Auto-detect')
      expect(autoOption).toBeUndefined()
    })

    it('changes explanation language when selected', () => {
      render(<LanguageSelector />)

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vi' } })

      expect(useSettingsStore.getState().explanationLang).toBe('vi')
    })

    it('shows current explanation language as selected', () => {
      useSettingsStore.setState({ explanationLang: 'ja' })
      render(<LanguageSelector />)

      expect(screen.getByRole('combobox')).toHaveValue('ja')
    })

    it('does not render swap button', () => {
      render(<LanguageSelector />)

      expect(screen.queryByTitle('Swap languages')).not.toBeInTheDocument()
    })
  })
})
