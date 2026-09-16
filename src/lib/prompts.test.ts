import { describe, it, expect } from 'vitest'
import { getCorrectionPrompt, getChangesExtractionPrompt } from './prompts'


describe('getCorrectionPrompt', () => {
  describe('fix level', () => {
    it('builds fix prompt with Qwen format', () => {
      const result = getCorrectionPrompt('Helo wrold', 'en', 'fix')

      expect(result).toContain('<|im_start|>system')
      expect(result).toContain('<|im_start|>user')
      expect(result).toContain('<|im_start|>assistant')
      expect(result).toContain('<|im_end|>')
    })

    it('includes fix-specific instructions', () => {
      const result = getCorrectionPrompt('Helo', 'en', 'fix')

      expect(result).toContain('proofreader')
      expect(result).toContain('spelling mistakes')
      expect(result).toContain('grammar errors')
      expect(result).toContain('Fix errors')
    })

    it('includes language name', () => {
      const result = getCorrectionPrompt('テスト', 'ja', 'fix')

      expect(result).toContain('Japanese')
    })
  })

  describe('improve level', () => {
    it('includes improve-specific instructions', () => {
      const result = getCorrectionPrompt('Good text.', 'en', 'improve')

      expect(result).toContain('editor')
      expect(result).toContain('Cut words that carry no meaning')
      expect(result).toContain('Improve')
    })

    it('uses Qwen format', () => {
      const result = getCorrectionPrompt('test', 'en', 'improve')

      expect(result).toContain('<|im_start|>')
      expect(result).toContain('<|im_end|>')
    })
  })

  describe('rewrite level', () => {
    it('includes rewrite-specific instructions', () => {
      const result = getCorrectionPrompt('Basic sentence.', 'en', 'rewrite')

      expect(result).toContain('writer')
      expect(result).toContain('Restructure')
      expect(result).toContain('plain, everyday words')
      expect(result).toContain('Rewrite')
    })

    it('uses Qwen format', () => {
      const result = getCorrectionPrompt('test', 'en', 'rewrite')

      expect(result).toContain('<|im_start|>')
      expect(result).toContain('<|im_end|>')
    })
  })

  it('includes strict output rules', () => {
    const result = getCorrectionPrompt('test', 'en', 'fix')

    expect(result).toContain('STRICT')
    expect(result).toContain('NEVER explain')
    expect(result).toContain('Single words')
  })
})

  // The levels must differ in how much they restructure, not in how formal they
  // sound: instructing the model to reach for grander words is what produced
  // "highly productive" and "numerous initiatives" from a casual note.
  describe('register and language guard rails', () => {
    const levels = ['fix', 'improve', 'rewrite'] as const

    it.each(levels)('does not ask %s to inflate the register', (level) => {
      const result = getCorrectionPrompt('some text', 'en', level)

      expect(result).not.toContain('sophisticated')
      expect(result).not.toContain('stronger alternatives')
      expect(result).not.toContain('professional')
      expect(result).not.toContain('engaging and polished')
    })

    it.each(levels)('tells %s to preserve the register and avoid padding', (level) => {
      const result = getCorrectionPrompt('some text', 'en', level)

      expect(result).toContain('casual stays casual')
      expect(result).toContain('never swap a common word for a rarer one')
      expect(result).toContain('Do not pad')
    })

    it.each(levels)('locks %s to the language of the input', (level) => {
      const result = getCorrectionPrompt('some text', 'ja', level)

      expect(result).toContain('the output MUST be Japanese only')
      expect(result).toContain('NEVER translate the text into another language')
    })

    // Phrasing a style rule as "in plain, direct language" reads to Qwen as a
    // choice of output language and made it answer in Chinese on 4 of 6 runs.
    it.each(levels)('keeps the word "language" out of the style rules for %s', (level) => {
      const result = getCorrectionPrompt('some text', 'en', level)

      expect(result).not.toContain('direct language')
    })
  })

describe('getChangesExtractionPrompt', () => {
  it('builds prompt with original and corrected text', () => {
    const result = getChangesExtractionPrompt(
      'Helo wrold',
      'Hello world',
      'en',
      'en'
    )

    expect(result).toContain('Original: Helo wrold')
    expect(result).toContain('Corrected: Hello world')
  })

  it('includes JSON format specification', () => {
    const result = getChangesExtractionPrompt('a', 'b', 'en', 'en')

    expect(result).toContain('JSON array')
    expect(result).toContain('"from"')
    expect(result).toContain('"to"')
    expect(result).toContain('"reason"')
  })

  it('includes text language', () => {
    const result = getChangesExtractionPrompt('テスト', 'テスト', 'ja', 'en')

    expect(result).toContain('Japanese')
  })

  it('specifies explanation language', () => {
    const result = getChangesExtractionPrompt('test', 'test', 'en', 'vi')

    expect(result).toContain('Vietnamese')
    expect(result).toContain('reason')
  })

  it('is a simple prompt without ChatML wrapper', () => {
    const result = getChangesExtractionPrompt('a', 'b', 'en', 'en')

    expect(result).not.toContain('<|im_start|>')
    expect(result).not.toContain('<|system|>')
  })
})
