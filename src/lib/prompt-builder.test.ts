import { describe, it, expect, vi } from 'vitest'
import {
  wrapPrompt,
  buildCorrectionPrompt,
  buildChangesExtractionPrompt,
  buildTranslationPrompt,
} from './prompt-builder'

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {})

describe('wrapPrompt', () => {
  describe('with qwen model', () => {
    it('wraps with ChatML format', () => {
      const result = wrapPrompt('System content', 'User content', 'qwen2.5:7b')

      expect(result.prompt).toContain('<|im_start|>system')
      expect(result.prompt).toContain('System content')
      expect(result.prompt).toContain('<|im_end|>')
      expect(result.prompt).toContain('<|im_start|>user')
      expect(result.prompt).toContain('User content')
      expect(result.prompt).toContain('<|im_start|>assistant')
      expect(result.system).toBeUndefined()
    })
  })

  describe('with aya model', () => {
    it('wraps with aya format', () => {
      const result = wrapPrompt('System content', 'User content', 'aya:8b')

      expect(result.prompt).toContain('<|system|>')
      expect(result.prompt).toContain('System content')
      expect(result.prompt).toContain('<|end|>')
      expect(result.prompt).toContain('<|user|>')
      expect(result.prompt).toContain('User content')
      expect(result.prompt).toContain('<|assistant|>')
      expect(result.system).toBeUndefined()
    })
  })

  describe('with llama model', () => {
    it('uses separate system parameter', () => {
      const result = wrapPrompt('System content', 'User content', 'llama3.2')

      expect(result.prompt).toBe('User content')
      expect(result.system).toBe('System content')
    })
  })

  describe('with gemma model', () => {
    it('uses separate system parameter', () => {
      const result = wrapPrompt('System content', 'User content', 'gemma2:9b')

      expect(result.prompt).toBe('User content')
      expect(result.system).toBe('System content')
    })
  })
})

describe('buildCorrectionPrompt', () => {
  describe('fix level', () => {
    it('builds prompt for fixing errors', () => {
      const result = buildCorrectionPrompt(
        'Helo wrold',
        'en',
        'fix',
        'qwen2.5:7b'
      )

      expect(result.prompt).toContain('English')
      expect(result.prompt).toContain('Fix errors')
      expect(result.prompt).toContain('Helo wrold')
      expect(result.prompt).toContain('spelling')
    })
  })

  describe('improve level', () => {
    it('builds prompt for improving text', () => {
      const result = buildCorrectionPrompt(
        'The text is good.',
        'en',
        'improve',
        'qwen2.5:7b'
      )

      expect(result.prompt).toContain('Improve')
      expect(result.prompt).toContain('The text is good.')
      expect(result.prompt).toContain('stronger alternatives')
    })
  })

  describe('rewrite level', () => {
    it('builds prompt for rewriting text', () => {
      const result = buildCorrectionPrompt(
        'Basic sentence.',
        'en',
        'rewrite',
        'qwen2.5:7b'
      )

      expect(result.prompt).toContain('Rewrite')
      expect(result.prompt).toContain('Basic sentence.')
      expect(result.prompt).toContain('professional')
    })
  })

  it('uses language native name', () => {
    const result = buildCorrectionPrompt(
      'こんにちは',
      'ja',
      'fix',
      'qwen2.5:7b'
    )

    expect(result.prompt).toContain('Japanese')
  })
})

describe('buildChangesExtractionPrompt', () => {
  it('builds prompt for extracting changes', () => {
    const result = buildChangesExtractionPrompt(
      'Helo wrold',
      'Hello world',
      'en',
      'en',
      'qwen2.5:7b'
    )

    expect(result.prompt).toContain('Original: Helo wrold')
    expect(result.prompt).toContain('Corrected: Hello world')
    expect(result.prompt).toContain('JSON')
    expect(result.prompt).toContain('English')
  })

  it('includes explanation language', () => {
    const result = buildChangesExtractionPrompt(
      'Helo',
      'Hello',
      'en',
      'ja',
      'qwen2.5:7b'
    )

    expect(result.prompt).toContain('Japanese')
    expect(result.prompt).toContain('reason')
  })

  it('does not use ChatML wrapper (simple prompt)', () => {
    const result = buildChangesExtractionPrompt(
      'test',
      'test',
      'en',
      'en',
      'qwen2.5:7b'
    )

    expect(result.system).toBeUndefined()
    expect(result.prompt).not.toContain('<|im_start|>')
  })
})

describe('buildTranslationPrompt', () => {
  it('builds translation prompt with specific languages', () => {
    const result = buildTranslationPrompt(
      'Hello world',
      'en',
      'ja',
      'qwen2.5:7b'
    )

    expect(result.prompt).toContain('English')
    expect(result.prompt).toContain('Japanese')
    expect(result.prompt).toContain('Hello world')
    expect(result.prompt).toContain('translator')
  })

  it('handles auto-detect source language', () => {
    const result = buildTranslationPrompt(
      'Hello world',
      'auto',
      'ja',
      'qwen2.5:7b'
    )

    expect(result.prompt).toContain('detected language')
    expect(result.prompt).not.toContain('auto')
  })

  it('wraps prompt for model type', () => {
    const qwenResult = buildTranslationPrompt('test', 'en', 'ja', 'qwen2.5:7b')
    expect(qwenResult.prompt).toContain('<|im_start|>')

    const llamaResult = buildTranslationPrompt('test', 'en', 'ja', 'llama3.2')
    expect(llamaResult.system).toBeDefined()
  })
})
