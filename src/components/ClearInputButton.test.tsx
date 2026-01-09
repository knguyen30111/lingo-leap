import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClearInputButton } from './ClearInputButton'

describe('ClearInputButton', () => {
  it('renders when visible is true', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('does not render when visible is false', () => {
    render(<ClearInputButton onClick={() => {}} visible={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has correct title attribute', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Clear input')
  })

  it('has correct aria-label', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Clear input text')
  })

  it('has type button', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<ClearInputButton onClick={handleClick} visible={true} />)
    await user.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders SVG icon', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('has correct CSS class', () => {
    render(<ClearInputButton onClick={() => {}} visible={true} />)
    expect(screen.getByRole('button')).toHaveClass('clear-input-btn')
  })
})
