import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders copy button', () => {
    render(<CopyButton text="test" />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows copy title by default', () => {
    render(<CopyButton text="test" />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Copy to clipboard')
  })

  it('applies custom className', () => {
    render(<CopyButton text="test" className="custom-class" />)
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('renders copy icon by default', () => {
    render(<CopyButton text="test" />)
    const button = screen.getByRole('button')
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('copies text to clipboard on click', async () => {
    // Mock navigator.clipboard for this specific test
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    render(<CopyButton text="Hello world" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('Hello world')
    })
  })

  it('shows copied state after successful copy', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    render(<CopyButton text="test" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Copied!')
    })
  })

  it('reverts to copy state after timeout', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    render(<CopyButton text="test" />)
    fireEvent.click(screen.getByRole('button'))

    // Verify copied state is set
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Copied!')
    })

    // Verify it eventually reverts (using real timers, with waitFor timeout)
    await waitFor(
      () => {
        expect(screen.getByRole('button')).toHaveAttribute('title', 'Copy to clipboard')
      },
      { timeout: 3000 }
    )
  })

  it('uses fallback copy for older browsers', async () => {
    // Mock clipboard to throw error
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Not supported')) },
    })

    // Mock document methods
    const execCommandMock = vi.fn()
    document.execCommand = execCommandMock

    render(<CopyButton text="fallback text" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith('copy')
    })
  })

  it('renders checkmark icon when copied', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    render(<CopyButton text="test" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      const button = screen.getByRole('button')
      const svg = button.querySelector('svg')
      expect(svg).toHaveClass('text-[var(--success)]')
    })
  })
})
