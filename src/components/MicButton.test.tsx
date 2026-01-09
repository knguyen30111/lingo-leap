import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MicButton } from './MicButton'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        voiceInput: 'Voice input',
        stopListening: 'Stop listening',
      }
      return translations[key] || key
    },
  }),
}))

describe('MicButton', () => {
  const defaultProps = {
    isListening: false,
    isSupported: true,
    onClick: vi.fn(),
  }

  it('renders when supported', () => {
    render(<MicButton {...defaultProps} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('does not render when not supported', () => {
    render(<MicButton {...defaultProps} isSupported={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows voice input title when not listening', () => {
    render(<MicButton {...defaultProps} isListening={false} />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Voice input')
  })

  it('shows stop listening title when listening', () => {
    render(<MicButton {...defaultProps} isListening={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Stop listening')
  })

  it('has aria-pressed false when not listening', () => {
    render(<MicButton {...defaultProps} isListening={false} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('has aria-pressed true when listening', () => {
    render(<MicButton {...defaultProps} isListening={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has correct aria-label when not listening', () => {
    render(<MicButton {...defaultProps} isListening={false} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Voice input')
  })

  it('has correct aria-label when listening', () => {
    render(<MicButton {...defaultProps} isListening={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Stop listening')
  })

  it('applies listening class when listening', () => {
    render(<MicButton {...defaultProps} isListening={true} />)
    expect(screen.getByRole('button')).toHaveClass('listening')
  })

  it('applies silence-detected class when silence detected', () => {
    render(<MicButton {...defaultProps} silenceDetected={true} />)
    expect(screen.getByRole('button')).toHaveClass('silence-detected')
  })

  it('has mic-button class', () => {
    render(<MicButton {...defaultProps} />)
    expect(screen.getByRole('button')).toHaveClass('mic-button')
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<MicButton {...defaultProps} onClick={handleClick} />)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<MicButton {...defaultProps} disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is not disabled by default', () => {
    render(<MicButton {...defaultProps} />)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('renders SVG microphone icon', () => {
    render(<MicButton {...defaultProps} />)
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('combines multiple classes correctly', () => {
    render(<MicButton {...defaultProps} isListening={true} silenceDetected={true} />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('mic-button')
    expect(button).toHaveClass('listening')
    expect(button).toHaveClass('silence-detected')
  })
})
