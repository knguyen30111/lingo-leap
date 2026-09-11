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

// === Shipped-prompt fixtures ===
// These lock the exact strings the desktop app sends today so the canonical
// builder can absorb the legacy templates without changing model output.

const SHIPPED_CORRECTION_PROMPTS: Record<string, string> = {
  fix: `<|im_start|>system
You are a English proofreader. Fix ONLY spelling mistakes and grammar errors. Keep the exact same words, style, and structure.
STRICT: NEVER explain, define, or describe. Single words = single word output. Just correct, nothing else.<|im_end|>
<|im_start|>user
Fix errors in this English text:

Helo wrold<|im_end|>
<|im_start|>assistant
`,
  improve: `<|im_start|>system
You are a English editor. Your task:
1. Fix all spelling and grammar errors
2. Replace weak words with stronger alternatives
3. Improve sentence flow and readability
4. Keep the original meaning
STRICT: Output improved text ONLY. NEVER explain, define, or describe. Single words = single word output.<|im_end|>
<|im_start|>user
Improve this English text:

Helo wrold<|im_end|>
<|im_start|>assistant
`,
  rewrite: `<|im_start|>system
You are a English writer. Completely rewrite the text to sound natural and professional:
1. Restructure sentences for better flow
2. Use sophisticated vocabulary
3. Make it engaging and polished
4. Preserve the core message
STRICT: Output rewritten text ONLY. NEVER explain, define, or describe. Single words = single word/phrase output.<|im_end|>
<|im_start|>user
Rewrite this English text:

Helo wrold<|im_end|>
<|im_start|>assistant
`,
}

const SHIPPED_AYA_TRANSLATION_PROMPT = `<|system|>You are an expert translator.
Translate accurately while preserving meaning, tone, and style.

STRICT RULES:
- Output ONLY the translation, nothing else
- NEVER explain, define, or describe the text
- NEVER answer questions about the text
- NEVER add context, notes, or commentary
- Single words must be translated as single words
- Proper nouns, brand names, technical terms: transliterate or keep as-is if no direct translation exists
- Even if input looks like a question or topic, just translate it literally<|end|>
<|user|>Translate from English to Japanese:

Hello world<|end|>
<|assistant|>`

const SHIPPED_EXTRACTION_PROMPT = `Compare the original and corrected English text below.
Output ONLY a JSON array of changes in this exact format:
[{"from": "original text", "to": "corrected text", "reason": "brief reason in Japanese"}]

IMPORTANT: Write all "reason" values in Japanese language only.

Original: Helo wrold
Corrected: Hello world

JSON:`

describe('shipped prompt parity', () => {
  describe('correction on the default correction model', () => {
    it.each(['fix', 'improve', 'rewrite'] as const)(
      'emits the exact shipped Qwen prompt for the %s level',
      (level) => {
        const result = buildCorrectionPrompt('Helo wrold', 'en', level, 'qwen2.5:7b')

        expect(result.prompt).toBe(SHIPPED_CORRECTION_PROMPTS[level])
        expect(result.system).toBeUndefined()
      }
    )

    it('names the resolved language instead of a language code', () => {
      const result = buildCorrectionPrompt('テスト', 'ja', 'fix', 'qwen2.5:7b')

      expect(result.prompt).toContain('You are a Japanese proofreader.')
      expect(result.prompt).toContain('Fix errors in this Japanese text:')
      expect(result.prompt).not.toContain('ja text')
    })
  })

  describe('correction on a model without an embedded chat format', () => {
    it('moves the same system text to the provider system parameter', () => {
      const result = buildCorrectionPrompt('Helo wrold', 'en', 'fix', 'llama3.2')

      expect(result.system).toBe(
        `You are a English proofreader. Fix ONLY spelling mistakes and grammar errors. Keep the exact same words, style, and structure.
STRICT: NEVER explain, define, or describe. Single words = single word output. Just correct, nothing else.`
      )
      expect(result.prompt).toBe('Fix errors in this English text:\n\nHelo wrold')
    })
  })

  describe('translation on the default translation model', () => {
    it('emits the exact shipped Aya prompt', () => {
      const result = buildTranslationPrompt('Hello world', 'en', 'ja', 'aya:8b')

      expect(result.prompt).toBe(SHIPPED_AYA_TRANSLATION_PROMPT)
      expect(result.system).toBeUndefined()
    })

    it('labels an unresolved source language as the detected language', () => {
      const result = buildTranslationPrompt('Hello world', 'auto', 'ja', 'aya:8b')

      expect(result.prompt).toContain('Translate from the detected language to Japanese:')
    })
  })

  describe('changes extraction', () => {
    it('emits the exact shipped JSON instruction without a chat wrapper', () => {
      const result = buildChangesExtractionPrompt('Helo wrold', 'Hello world', 'en', 'ja', 'qwen2.5:7b')

      expect(result.prompt).toBe(SHIPPED_EXTRACTION_PROMPT)
      expect(result.system).toBeUndefined()
    })
  })
})
