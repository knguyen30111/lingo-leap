import { describe, it, expect } from 'vitest'
import {
  getTranslationPrompt,
  getCorrectionPrompt,
  getChangesExtractionPrompt,
} from './prompts'

describe('getTranslationPrompt', () => {
  it('builds prompt with specific languages', () => {
    const result = getTranslationPrompt('Hello world', 'en', 'ja')

    expect(result).toContain('English')
    expect(result).toContain('Japanese')
    expect(result).toContain('Hello world')
  })

  it('handles auto-detect source language', () => {
    const result = getTranslationPrompt('Hello world', 'auto', 'ja')

    expect(result).toContain('detected language')
    expect(result).not.toContain('auto')
  })

  it('uses Aya format with special tokens', () => {
    const result = getTranslationPrompt('test', 'en', 'ja')

    expect(result).toContain('<|system|>')
    expect(result).toContain('<|user|>')
    expect(result).toContain('<|assistant|>')
    expect(result).toContain('<|end|>')
  })

  it('includes translation rules', () => {
    const result = getTranslationPrompt('test', 'en', 'ja')

    expect(result).toContain('translator')
    expect(result).toContain('ONLY the translation')
  })
})

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
      expect(result).toContain('stronger alternatives')
      expect(result).toContain('readability')
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
      expect(result).toContain('sophisticated vocabulary')
      expect(result).toContain('professional')
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
