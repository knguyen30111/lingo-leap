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

// Streaming sets the output text chunk by chunk while the request is still in
// flight. A body that only ever shows skeletons while loading therefore hides
// the very thing streaming exists to deliver.
describe('EditorOutputBody while a streamed response arrives', () => {
  it('shows the partial output instead of the skeleton', () => {
    const { container } = renderBody({ isLoading: true, outputText: 'Xin ch' })

    expect(screen.getByText('Xin ch')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('keeps showing the skeleton until the first chunk arrives', () => {
    const { container } = renderBody({ isLoading: true, outputText: '' })

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('treats whitespace-only output as nothing having arrived yet', () => {
    const { container } = renderBody({ isLoading: true, outputText: '   ' })

    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('marks the partial output as still streaming', () => {
    renderBody({ isLoading: true, outputText: 'Xin ch' })

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('does not mark a settled output as streaming', () => {
    renderBody({ outputText: 'Xin chào' })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the partial output in preference to an error that has not settled', () => {
    renderBody({ isLoading: true, error: 'boom', outputText: 'Xin ch' })

    expect(screen.getByText('Xin ch')).toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('does not show the placeholder while a chunk is on screen', () => {
    renderBody({ isLoading: true, outputText: 'Xin ch' })

    expect(screen.queryByText('Translation will appear here')).not.toBeInTheDocument()
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
