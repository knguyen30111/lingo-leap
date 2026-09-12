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

const COPY_BUTTON_BASE =
  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-md transition-colors'
const IDLE_COPY_CLASS =
  `${COPY_BUTTON_BASE} text-[var(--text-secondary)] hover:text-[var(--text-primary)]` +
  ' hover:bg-[var(--glass-bg)] border-[var(--border-color)]'
const COPIED_COPY_CLASS =
  `${COPY_BUTTON_BASE} text-[var(--success)] border-[var(--success)] bg-[var(--success)]/10`
const REGENERATE_CLASS =
  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--text-secondary)]' +
  ' hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--border-color)]' +
  ' rounded-md transition-colors'
const CLIPBOARD_ICON_D =
  'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0' +
  ' 00-2 2v8a2 2 0 002 2z'
const CHECK_ICON_D = 'M5 13l4 4L19 7'
const REGENERATE_ICON_D =
  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0' +
  ' 01-15.357-2m15.357 2H15'

// The idle and copied states differ only in the class list and the icon path, so both are
// asserted verbatim together with the svg > path hierarchy, the label, and the title. A
// looser assertion lets a restyle, an icon swap, or a lost title through unnoticed.
function expectIconPath(icon: Element, sizeClass: string, d: string) {
  expect(icon.tagName).toBe('svg')
  expect(icon).toHaveAttribute('class', sizeClass)
  expect(icon).toHaveAttribute('fill', 'none')
  expect(icon).toHaveAttribute('stroke', 'currentColor')
  expect(icon).toHaveAttribute('viewBox', '0 0 24 24')
  expect(icon.children).toHaveLength(1)

  const path = icon.firstElementChild as Element
  expect(path.tagName).toBe('path')
  expect(path).toHaveAttribute('stroke-linecap', 'round')
  expect(path).toHaveAttribute('stroke-linejoin', 'round')
  expect(path).toHaveAttribute('stroke-width', '2')
  expect(path).toHaveAttribute('d', d)
}

function expectCopyButton(state: 'idle' | 'copied'): HTMLButtonElement {
  const label = state === 'copied' ? 'Copied' : 'Copy'
  const button = screen.getByText(label).closest('button') as HTMLButtonElement

  expect(button).toHaveAttribute(
    'class',
    state === 'copied' ? COPIED_COPY_CLASS : IDLE_COPY_CLASS
  )
  expect(button).toHaveAttribute('title', 'Copy')
  expect(Array.from(button.children).map((el) => el.tagName)).toEqual(['svg', 'SPAN'])
  expectIconPath(
    button.children[0],
    'w-3.5 h-3.5',
    state === 'copied' ? CHECK_ICON_D : CLIPBOARD_ICON_D
  )
  expect(button.children[1]).toHaveTextContent(label)

  return button
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

    const done = screen.getByText('Done').closest('div') as HTMLElement
    expect(done).toHaveAttribute('class', 'flex items-center gap-1.5 text-[var(--success)]')
    expectIconPath(done.children[0], 'w-4 h-4', CHECK_ICON_D)

    const regenerate = screen.getByTitle('Re-translate')
    expect(regenerate).toHaveAttribute('class', REGENERATE_CLASS)
    expectIconPath(regenerate.children[0], 'w-3.5 h-3.5', REGENERATE_ICON_D)

    // The copy control starts in its idle dress: neutral classes and the clipboard icon.
    expectCopyButton('idle')
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
    // The rejection carries the text the user asked to copy, so the diagnostic
    // has to survive without the payload reaching the console.
    const COPY_ERROR_SENTINEL = 'ZZ-COPY-ERROR-SENTINEL-ZZ'
    vi.mocked(copyOutput).mockResolvedValue({
      copied: false,
      hidden: false,
      copyError: new Error(COPY_ERROR_SENTINEL),
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderActions({ outputText: 'Xin chào' })

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledTimes(1)
    })
    const args = consoleSpy.mock.calls[0] as unknown[]
    expect(args).toHaveLength(1)
    expect(typeof args[0]).toBe('string')
    expect(args[0] as string).not.toContain(COPY_ERROR_SENTINEL)
    expect(args[0] as string).not.toContain('Xin chào')

    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    // Not merely "no Copied label": the button keeps its exact idle class list and icon.
    expectCopyButton('idle')

    consoleSpy.mockRestore()
  })

  it('shows the copied label and reverts on the 2000 ms boundary, not before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    try {
      renderActions({ outputText: 'Xin chào' })
      const idle = expectCopyButton('idle')

      fireEvent.click(screen.getByText('Copy'))
      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
      expect(expectCopyButton('copied')).toBe(idle)

      // The scheduled delay is pinned exactly, because `shouldAdvanceTime` lets real time
      // move the fake clock during `waitFor` and a 1 ms-precision assertion would be
      // flaky. Well short of the boundary the copied dress is still on screen, so a
      // shortened timer cannot pass by landing on the same end state either.
      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(expectCopyButton('copied')).toBe(idle)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(screen.queryByText('Copied')).not.toBeInTheDocument()
      expect(expectCopyButton('idle')).toBe(idle)
    } finally {
      timeoutSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('keeps the copy title and the same button across the copied transition', async () => {
    renderActions({ outputText: 'Xin chào' })

    const idle = expectCopyButton('idle')

    fireEvent.click(screen.getByText('Copy'))

    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument()
    })
    // Same node, copied dress: the class list, the icon path and the label all change while
    // the element survives, which is what keeps keyboard focus where the user put it.
    const copied = expectCopyButton('copied')
    expect(copied).toBe(idle)
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
    // The focused node is the one that changed dress, so this is a re-render rather than a
    // remount that happened to leave focus somewhere plausible.
    expect(expectCopyButton('copied')).toBe(copyButton)
  })
})
