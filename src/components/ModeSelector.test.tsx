import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeSelector } from './ModeSelector'
import { useAppStore } from '../stores/appStore'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        translate: 'Translate',
        correct: 'Correct',
      }
      return translations[key] || key
    },
  }),
}))

describe('ModeSelector', () => {
  beforeEach(() => {
    useAppStore.setState({
      mode: 'translate',
      isEnabled: true,
      isLoading: false,
      isChangesLoading: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders translate and correct buttons', () => {
    render(<ModeSelector />)

    expect(screen.getByText('Translate')).toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('shows translate as active when mode is translate', () => {
    render(<ModeSelector />)

    const translateBtn = screen.getByText('Translate')
    const correctBtn = screen.getByText('Correct')

    expect(translateBtn).toHaveClass('active')
    expect(correctBtn).not.toHaveClass('active')
  })

  it('shows correct as active when mode is correct', () => {
    useAppStore.setState({ mode: 'correct' })
    render(<ModeSelector />)

    const translateBtn = screen.getByText('Translate')
    const correctBtn = screen.getByText('Correct')

    expect(translateBtn).not.toHaveClass('active')
    expect(correctBtn).toHaveClass('active')
  })

  it('switches to correct mode when clicked', () => {
    render(<ModeSelector />)

    fireEvent.click(screen.getByText('Correct'))

    expect(useAppStore.getState().mode).toBe('correct')
  })

  it('switches to translate mode when clicked', () => {
    useAppStore.setState({ mode: 'correct' })
    render(<ModeSelector />)

    fireEvent.click(screen.getByText('Translate'))

    expect(useAppStore.getState().mode).toBe('translate')
  })

  it('disables buttons when isEnabled is false', () => {
    useAppStore.setState({ isEnabled: false })
    render(<ModeSelector />)

    expect(screen.getByText('Translate')).toBeDisabled()
    expect(screen.getByText('Correct')).toBeDisabled()
  })

  it('disables buttons when isLoading is true', () => {
    useAppStore.setState({ isLoading: true })
    render(<ModeSelector />)

    expect(screen.getByText('Translate')).toBeDisabled()
    expect(screen.getByText('Correct')).toBeDisabled()
  })

  it('disables buttons when isChangesLoading is true', () => {
    useAppStore.setState({ isChangesLoading: true })
    render(<ModeSelector />)

    expect(screen.getByText('Translate')).toBeDisabled()
    expect(screen.getByText('Correct')).toBeDisabled()
  })

  it('enables buttons when all conditions are met', () => {
    useAppStore.setState({
      isEnabled: true,
      isLoading: false,
      isChangesLoading: false,
    })
    render(<ModeSelector />)

    expect(screen.getByText('Translate')).not.toBeDisabled()
    expect(screen.getByText('Correct')).not.toBeDisabled()
  })

  it('has segmented-control class on container', () => {
    const { container } = render(<ModeSelector />)
    expect(container.querySelector('.segmented-control')).toBeInTheDocument()
  })
})
