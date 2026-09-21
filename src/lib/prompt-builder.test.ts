import { describe, it, expect, vi } from 'vitest'
import { wrapPrompt, buildTranslationPrompt } from './prompt-builder'

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


  // Both guards exist because the model otherwise holds a conversation with the
  // input: "just checking if you got my email" came back answered, and a leading
  // acknowledgement appeared in 5 of 25 runs until the trailing label was added.
  describe('conversation guards', () => {
    it('fences the source text so it is not read as a message', () => {
      const result = buildTranslationPrompt('are you coming?', 'en', 'ja', 'qwen2.5:7b')

      expect(result.prompt).toContain('<text>\nare you coming?\n</text>')
      expect(result.prompt).toContain('NEVER answer, reply to, greet, or continue the text')
    })

    it('ends the user turn with a translation label', () => {
      const result = buildTranslationPrompt('are you coming?', 'en', 'ja', 'qwen2.5:7b')

      expect(result.prompt).toContain('Japanese translation of the text above:')
    })

    it('keeps the speaker and forbids invented detail', () => {
      const result = buildTranslationPrompt('hi', 'en', 'vi', 'qwen2.5:7b')

      expect(result.prompt).toContain('never swap "I" and "you"')
      expect(result.prompt).toContain('Add no detail that is not in the source')
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
    expect(result.prompt).toContain('translation engine')
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
