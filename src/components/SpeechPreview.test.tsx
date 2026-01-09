import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpeechPreview } from './SpeechPreview'

describe('SpeechPreview', () => {
  const defaultProps = {
    isVisible: true,
    transcript: '',
    interimTranscript: '',
  }

  it('renders with visible class when isVisible is true', () => {
    const { container } = render(<SpeechPreview {...defaultProps} isVisible={true} />)
    expect(container.querySelector('.speech-preview')).toHaveClass('visible')
  })

  it('renders without visible class when isVisible is false', () => {
    const { container } = render(<SpeechPreview {...defaultProps} isVisible={false} />)
    expect(container.querySelector('.speech-preview')).not.toHaveClass('visible')
  })

  it('shows placeholder text when no transcript', () => {
    render(<SpeechPreview {...defaultProps} />)
    expect(screen.getByText('Start speaking...')).toBeInTheDocument()
  })

  it('shows interim transcript when available', () => {
    render(<SpeechPreview {...defaultProps} interimTranscript="Hello wor" />)
    expect(screen.getByText('Hello wor')).toBeInTheDocument()
  })

  it('shows final transcript when no interim', () => {
    render(<SpeechPreview {...defaultProps} transcript="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('prefers interim transcript over final', () => {
    render(
      <SpeechPreview
        {...defaultProps}
        transcript="Hello"
        interimTranscript="Hello wor"
      />
    )
    expect(screen.getByText('Hello wor')).toBeInTheDocument()
    expect(screen.queryByText(/^Hello$/)).not.toBeInTheDocument()
  })

  it('has empty class when no text', () => {
    const { container } = render(<SpeechPreview {...defaultProps} />)
    expect(container.querySelector('.speech-preview-text')).toHaveClass('empty')
  })

  it('does not have empty class when has text', () => {
    const { container } = render(
      <SpeechPreview {...defaultProps} transcript="Hello" />
    )
    expect(container.querySelector('.speech-preview-text')).not.toHaveClass('empty')
  })

  it('has final class when transcript is final', () => {
    const { container } = render(
      <SpeechPreview {...defaultProps} transcript="Hello" interimTranscript="" />
    )
    expect(container.querySelector('.speech-preview-text')).toHaveClass('final')
  })

  it('does not have final class when interim transcript exists', () => {
    const { container } = render(
      <SpeechPreview {...defaultProps} transcript="Hello" interimTranscript="Hello wor" />
    )
    expect(container.querySelector('.speech-preview-text')).not.toHaveClass('final')
  })

  it('has role status for accessibility', () => {
    render(<SpeechPreview {...defaultProps} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has aria-live polite', () => {
    const { container } = render(<SpeechPreview {...defaultProps} />)
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('has aria-atomic true', () => {
    const { container } = render(<SpeechPreview {...defaultProps} />)
    expect(container.querySelector('[aria-atomic="true"]')).toBeInTheDocument()
  })

  it('shows listening status', () => {
    render(<SpeechPreview {...defaultProps} />)
    expect(screen.getByText('Listening...')).toBeInTheDocument()
  })

  it('shows hint to stop listening', () => {
    render(<SpeechPreview {...defaultProps} />)
    expect(screen.getByText('Click mic to stop')).toBeInTheDocument()
  })

  it('has listening dot with aria-hidden', () => {
    const { container } = render(<SpeechPreview {...defaultProps} />)
    const dot = container.querySelector('.listening-dot')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
})
