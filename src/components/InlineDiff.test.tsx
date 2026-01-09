import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InlineDiff } from './InlineDiff'

describe('InlineDiff', () => {
  it('shows no changes message when text is identical', () => {
    render(<InlineDiff original="Hello world" corrected="Hello world" />)
    expect(screen.getByText(/No changes made/)).toBeInTheDocument()
    expect(screen.getByText(/already correct/)).toBeInTheDocument()
  })

  it('shows removed text with strikethrough', () => {
    render(<InlineDiff original="Hello world" corrected="Hello" />)
    const removed = screen.getByText('world')
    expect(removed).toHaveClass('line-through')
  })

  it('shows added text with underline', () => {
    render(<InlineDiff original="Hello" corrected="Hello world" />)
    const added = screen.getByText('world')
    expect(added).toHaveClass('underline')
  })

  it('shows legend with removed and added indicators', () => {
    render(<InlineDiff original="old" corrected="new" />)
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText('Added')).toBeInTheDocument()
  })

  it('shows change count', () => {
    render(<InlineDiff original="one" corrected="two" />)
    expect(screen.getByText(/change/)).toBeInTheDocument()
  })

  it('handles word replacement', () => {
    render(<InlineDiff original="The cat sat" corrected="The dog sat" />)
    expect(screen.getByText('cat')).toHaveClass('line-through')
    expect(screen.getByText('dog')).toHaveClass('underline')
  })

  it('handles multiple word changes', () => {
    render(<InlineDiff original="Hello big world" corrected="Hi small planet" />)
    // Check that removed words exist
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('big')).toBeInTheDocument()
    expect(screen.getByText('world')).toBeInTheDocument()
    // Check that added words exist
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText('small')).toBeInTheDocument()
    expect(screen.getByText('planet')).toBeInTheDocument()
  })

  it('preserves unchanged text', () => {
    render(<InlineDiff original="The cat runs" corrected="The dog runs" />)
    // 'The' and 'runs' should be unchanged
    const container = screen.getByText(/The/).closest('div')
    expect(container).toBeInTheDocument()
  })

  it('handles empty strings', () => {
    render(<InlineDiff original="" corrected="" />)
    expect(screen.getByText(/No changes made/)).toBeInTheDocument()
  })

  it('handles adding to empty string', () => {
    render(<InlineDiff original="" corrected="Hello" />)
    expect(screen.getByText('Hello')).toHaveClass('underline')
  })

  it('handles removing all content', () => {
    render(<InlineDiff original="Hello" corrected="" />)
    expect(screen.getByText('Hello')).toHaveClass('line-through')
  })

  it('applies correct CSS classes for removed segments', () => {
    render(<InlineDiff original="old text" corrected="new text" />)
    const removed = screen.getByText('old')
    expect(removed).toHaveClass('bg-red-100')
    expect(removed).toHaveClass('text-red-600')
  })

  it('applies correct CSS classes for added segments', () => {
    render(<InlineDiff original="old text" corrected="new text" />)
    const added = screen.getByText('new')
    expect(added).toHaveClass('bg-green-100')
    expect(added).toHaveClass('text-green-600')
  })

  it('handles whitespace preservation', () => {
    render(<InlineDiff original="word1  word2" corrected="word1  word2" />)
    expect(screen.getByText(/No changes made/)).toBeInTheDocument()
  })

  it('handles punctuation changes', () => {
    render(<InlineDiff original="Hello." corrected="Hello!" />)
    // The diff algorithm works on words, so punctuation attached to words
    expect(screen.getByText('Hello.')).toBeInTheDocument()
    expect(screen.getByText('Hello!')).toBeInTheDocument()
  })

  it('handles whitespace between changed words', () => {
    // This tests the whitespace handling in LCS algorithm (lines 53, 63)
    render(<InlineDiff original="one two three" corrected="one four three" />)
    // 'two' should be removed, 'four' should be added
    expect(screen.getByText('two')).toHaveClass('line-through')
    expect(screen.getByText('four')).toHaveClass('underline')
    // 'one' and 'three' should remain unchanged
    const container = screen.getByText('one').closest('div')
    expect(container).toBeInTheDocument()
  })

  it('handles consecutive whitespace tokens', () => {
    // Test case with whitespace being part of the split
    render(<InlineDiff original="a  b  c" corrected="a  x  c" />)
    expect(screen.getByText('b')).toHaveClass('line-through')
    expect(screen.getByText('x')).toHaveClass('underline')
  })

  it('preserves whitespace between removed words in LCS', () => {
    // Test where whitespace is between removed words (hits line 53)
    render(<InlineDiff original="keep remove1 remove2 keep2" corrected="keep keep2" />)
    expect(screen.getByText('remove1')).toHaveClass('line-through')
    expect(screen.getByText('remove2')).toHaveClass('line-through')
  })

  it('preserves whitespace between added words in LCS', () => {
    // Test where whitespace is between added words (hits line 63)
    render(<InlineDiff original="keep keep2" corrected="keep add1 add2 keep2" />)
    expect(screen.getByText('add1')).toHaveClass('underline')
    expect(screen.getByText('add2')).toHaveClass('underline')
  })
})
