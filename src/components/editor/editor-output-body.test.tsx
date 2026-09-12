import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorOutputBody } from './editor-output-body'

const FOUR_BARS = ['w-full', 'w-5/6', 'w-4/6', 'w-3/4'] as const
const THREE_BARS = ['w-full', 'w-5/6', 'w-4/6'] as const

function renderBody(overrides: Partial<Parameters<typeof EditorOutputBody>[0]> = {}) {
  return render(
    <EditorOutputBody
      isLoading={false}
      error={null}
      outputText=""
      placeholder="Translation will appear here"
      skeletonWidths={FOUR_BARS}
      {...overrides}
    />
  )
}

describe('EditorOutputBody priority', () => {
  it('renders the skeleton while loading', () => {
    const { container } = renderBody({ isLoading: true })

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(screen.queryByText('Translation will appear here')).not.toBeInTheDocument()
  })

  it('shows the skeleton in preference to a simultaneous error', () => {
    const { container } = renderBody({ isLoading: true, error: 'boom' })

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('shows an error in preference to simultaneous output', () => {
    renderBody({ error: 'boom', outputText: 'Xin chào' })

    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByText('Xin chào')).not.toBeInTheDocument()
  })

  it('renders the output when neither loading nor failing', () => {
    renderBody({ outputText: 'Xin chào' })

    expect(screen.getByText('Xin chào')).toBeInTheDocument()
    expect(screen.queryByText('Translation will appear here')).not.toBeInTheDocument()
  })

  it('renders the placeholder when there is nothing to show', () => {
    renderBody()

    expect(screen.getByText('Translation will appear here')).toBeInTheDocument()
  })
})

describe('EditorOutputBody skeleton widths', () => {
  it('renders one bar per entry for a four-entry width list', () => {
    const { container } = renderBody({ isLoading: true, skeletonWidths: FOUR_BARS })

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(4)
  })

  it('renders one bar per entry for a three-entry width list', () => {
    const { container } = renderBody({ isLoading: true, skeletonWidths: THREE_BARS })

    expect(container.querySelectorAll('.animate-pulse > div')).toHaveLength(3)
  })
})
