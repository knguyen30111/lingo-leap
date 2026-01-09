import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionButtons } from './ActionButtons'
import { useAppStore } from '../stores/appStore'

// Mock Tauri clipboard
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}))

describe('ActionButtons', () => {
  beforeEach(() => {
    useAppStore.setState({
      outputText: '',
      isLoading: false,
    })
    vi.clearAllMocks()
  })

  it('renders copy button', () => {
    render(<ActionButtons />)
    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('disables button when no output text', () => {
    useAppStore.setState({ outputText: '' })
    render(<ActionButtons />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('disables button when loading', () => {
    useAppStore.setState({ outputText: 'Some text', isLoading: true })
    render(<ActionButtons />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('enables button when has output and not loading', () => {
    useAppStore.setState({ outputText: 'Some text', isLoading: false })
    render(<ActionButtons />)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('copies text on click', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    useAppStore.setState({ outputText: 'Text to copy', isLoading: false })

    const user = userEvent.setup()
    render(<ActionButtons />)

    await user.click(screen.getByRole('button'))

    expect(writeText).toHaveBeenCalledWith('Text to copy')
  })

  it('shows copied state after click', async () => {
    useAppStore.setState({ outputText: 'Text to copy', isLoading: false })

    const user = userEvent.setup()
    render(<ActionButtons />)

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
  })

  it('does not copy when button is clicked while disabled', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    useAppStore.setState({ outputText: '', isLoading: false })

    render(<ActionButtons />)
    const button = screen.getByRole('button')

    // Button is disabled, click should not trigger handler
    fireEvent.click(button)

    // Verify writeText was never called
    expect(writeText).not.toHaveBeenCalled()
  })

  it('handles copy error gracefully', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    vi.mocked(writeText).mockRejectedValueOnce(new Error('Copy failed'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAppStore.setState({ outputText: 'Text', isLoading: false })

    const user = userEvent.setup()
    render(<ActionButtons />)

    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
    })

    consoleSpy.mockRestore()
  })
})
