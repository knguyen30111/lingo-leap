import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditorOutputActions } from './editor-output-actions'
import { copyOutput } from '../../lib/copy-output'

// Mocked at the copyOutput boundary rather than at the Tauri plugin, because the
// abstraction boundary is what this issue is about. The end-to-end auto-hide chain stays
// covered by the view tests and by src/lib/copy-output.test.ts.
vi.mock('../../lib/copy-output', () => ({
  copyOutput: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        done: 'Done',
        copy: 'Copy',
        copied: 'Copied',
      }
      return translations[key] || key
    },
  }),
}))

function renderActions(
  overrides: Partial<Parameters<typeof EditorOutputActions>[0]> = {}
) {
  return render(
    <EditorOutputActions
      isLoading={false}
      loadingLabel="Translating..."
      outputText=""
      onRegenerate={() => {}}
      regenerateLabel="Re-translate"
      submitLabel="Translate"
      submitTitle="Translate (⌘+Enter)"
      submitDisabled={false}
      {...overrides}
    />
  )
}

beforeEach(() => {
  vi.mocked(copyOutput).mockReset()
  vi.mocked(copyOutput).mockResolvedValue({ copied: true, hidden: false })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EditorOutputActions loading', () => {
  it('renders the loading label and no action button while loading', () => {
    renderActions({ isLoading: true })

    expect(screen.getByText('Translating...')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('EditorOutputActions with output', () => {
  it('renders the done row, regenerate, and copy when output exists', () => {
    renderActions({ outputText: 'Xin chào' })

    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByTitle('Re-translate')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('calls onRegenerate when regenerate is clicked', () => {
    const onRegenerate = vi.fn()
    renderActions({ outputText: 'Xin chào', onRegenerate })

    fireEvent.click(screen.getByTitle('Re-translate'))

    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('renders the regenerate label verbatim', () => {
    renderActions({ outputText: 'Xin chào' })

    expect(screen.getByTitle('Re-translate')).toHaveTextContent('Re-translate')
  })
})

describe('EditorOutputActions without output', () => {
  it('renders only the submit button when there is no output', () => {
    renderActions({ outputText: '' })

    expect(screen.getByText('Translate')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(1)
  })

  it('disables the submit button when submitDisabled', () => {
    renderActions({ outputText: '', submitDisabled: true })

    expect(screen.getByText('Translate')).toBeDisabled()
  })

  it('calls onRegenerate when submit is clicked', () => {
    const onRegenerate = vi.fn()
    renderActions({ outputText: '', onRegenerate })

    fireEvent.click(screen.getByText('Translate'))

    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('renders the submit title verbatim', () => {
    renderActions({ outputText: '' })

    expect(screen.getByText('Translate')).toHaveAttribute('title', 'Translate (⌘+Enter)')
  })
})

describe('EditorOutputActions copy', () => {
  it('copies the output text through copyOutput', async () => {
    renderActions({ outputText: 'Xin chào' })

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(copyOutput).toHaveBeenCalledWith('Xin chào')
    })
  })

  it('logs a failed copy and does not enter the copied state', async () => {
    vi.mocked(copyOutput).mockResolvedValue({
      copied: false,
      hidden: false,
      copyError: new Error('Copy failed'),
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderActions({ outputText: 'Xin chào' })

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error))
    })
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('shows the copied label and reverts after 2000 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderActions({ outputText: 'Xin chào' })

      fireEvent.click(screen.getByText('Copy'))
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(screen.queryByText('Copied')).not.toBeInTheDocument()
      expect(screen.getByText('Copy')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the copy title in both states', async () => {
    renderActions({ outputText: 'Xin chào' })

    expect(screen.getByText('Copy').closest('button')).toHaveAttribute('title', 'Copy')

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
    expect(screen.getByText('Copied').closest('button')).toHaveAttribute('title', 'Copy')
  })
})

describe('EditorOutputActions focus', () => {
  it('keeps focus on the copy button across the copied re-render', async () => {
    renderActions({ outputText: 'Xin chào' })
    const copyButton = screen.getByText('Copy').closest('button') as HTMLButtonElement
    copyButton.focus()
    expect(document.activeElement).toBe(copyButton)

    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
    expect(document.activeElement).toBe(copyButton)
  })
})
