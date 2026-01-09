import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CorrectionTabs } from './CorrectionTabs'
import { useAppStore } from '../stores/appStore'

// Mock the useCorrection hook
const mockSetLevel = vi.fn()
vi.mock('../hooks/useCorrection', () => ({
  useCorrection: () => ({
    setLevel: mockSetLevel,
  }),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'correction.fix': 'Fix',
        'correction.improve': 'Improve',
        'correction.rewrite': 'Rewrite',
      }
      return translations[key] || key
    },
  }),
}))

describe('CorrectionTabs', () => {
  beforeEach(() => {
    useAppStore.setState({
      correctionLevel: 'fix',
      isLoading: false,
    })
    mockSetLevel.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders all three correction level buttons', () => {
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).toBeInTheDocument()
    expect(screen.getByText('Improve')).toBeInTheDocument()
    expect(screen.getByText('Rewrite')).toBeInTheDocument()
  })

  it('shows fix as active when correctionLevel is fix', () => {
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).toHaveClass('active')
    expect(screen.getByText('Improve')).not.toHaveClass('active')
    expect(screen.getByText('Rewrite')).not.toHaveClass('active')
  })

  it('shows improve as active when correctionLevel is improve', () => {
    useAppStore.setState({ correctionLevel: 'improve' })
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).not.toHaveClass('active')
    expect(screen.getByText('Improve')).toHaveClass('active')
    expect(screen.getByText('Rewrite')).not.toHaveClass('active')
  })

  it('shows rewrite as active when correctionLevel is rewrite', () => {
    useAppStore.setState({ correctionLevel: 'rewrite' })
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).not.toHaveClass('active')
    expect(screen.getByText('Improve')).not.toHaveClass('active')
    expect(screen.getByText('Rewrite')).toHaveClass('active')
  })

  it('calls setLevel with fix when Fix clicked', () => {
    useAppStore.setState({ correctionLevel: 'improve' })
    render(<CorrectionTabs />)

    fireEvent.click(screen.getByText('Fix'))

    expect(mockSetLevel).toHaveBeenCalledWith('fix')
  })

  it('calls setLevel with improve when Improve clicked', () => {
    render(<CorrectionTabs />)

    fireEvent.click(screen.getByText('Improve'))

    expect(mockSetLevel).toHaveBeenCalledWith('improve')
  })

  it('calls setLevel with rewrite when Rewrite clicked', () => {
    render(<CorrectionTabs />)

    fireEvent.click(screen.getByText('Rewrite'))

    expect(mockSetLevel).toHaveBeenCalledWith('rewrite')
  })

  it('disables buttons when isLoading is true', () => {
    useAppStore.setState({ isLoading: true })
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).toBeDisabled()
    expect(screen.getByText('Improve')).toBeDisabled()
    expect(screen.getByText('Rewrite')).toBeDisabled()
  })

  it('enables buttons when isLoading is false', () => {
    useAppStore.setState({ isLoading: false })
    render(<CorrectionTabs />)

    expect(screen.getByText('Fix')).not.toBeDisabled()
    expect(screen.getByText('Improve')).not.toBeDisabled()
    expect(screen.getByText('Rewrite')).not.toBeDisabled()
  })

  it('has segmented-control class on container', () => {
    const { container } = render(<CorrectionTabs />)
    expect(container.querySelector('.segmented-control')).toBeInTheDocument()
  })

  it('has segmented-control-item class on buttons', () => {
    const { container } = render(<CorrectionTabs />)
    const buttons = container.querySelectorAll('.segmented-control-item')
    expect(buttons).toHaveLength(3)
  })
})
