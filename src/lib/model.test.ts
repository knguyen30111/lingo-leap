import { describe, it, expect } from 'vitest'
import {
  getModelType,
  getModelFormat,
  supportsEmbeddedFormat,
  cleanModelOutput,
} from './model'

describe('getModelType', () => {
  it('identifies qwen models', () => {
    expect(getModelType('qwen2.5:7b')).toBe('qwen')
    expect(getModelType('Qwen-2.5-14B')).toBe('qwen')
  })

  it('identifies aya models', () => {
    expect(getModelType('aya:8b')).toBe('aya')
    expect(getModelType('aya-expanse:32b')).toBe('aya')
  })

  it('identifies llama models', () => {
    expect(getModelType('llama3.2')).toBe('llama')
    expect(getModelType('Llama-3.1:8b')).toBe('llama')
  })

  it('identifies gemma models', () => {
    expect(getModelType('gemma2:9b')).toBe('gemma')
    expect(getModelType('Gemma-2B')).toBe('gemma')
  })

  it('defaults to aya for unknown models', () => {
    expect(getModelType('unknown-model')).toBe('aya')
    expect(getModelType('mistral:7b')).toBe('aya')
  })

  it('is case-insensitive', () => {
    expect(getModelType('QWEN2.5')).toBe('qwen')
    expect(getModelType('AYA:8B')).toBe('aya')
  })
})

describe('getModelFormat', () => {
  it('returns qwen format for qwen type', () => {
    const format = getModelFormat('qwen')
    expect(format).toBeDefined()
    expect(format?.systemStart).toBe('<|im_start|>system\n')
    expect(format?.systemEnd).toBe('<|im_end|>\n')
    expect(format?.userStart).toBe('<|im_start|>user\n')
    expect(format?.userEnd).toBe('<|im_end|>\n')
    expect(format?.assistantStart).toBe('<|im_start|>assistant\n')
  })

  it('returns aya format for aya type', () => {
    const format = getModelFormat('aya')
    expect(format).toBeDefined()
    expect(format?.systemStart).toBe('<|system|>')
    expect(format?.systemEnd).toBe('<|end|>\n')
    expect(format?.userStart).toBe('<|user|>')
    expect(format?.userEnd).toBe('<|end|>\n')
    expect(format?.assistantStart).toBe('<|assistant|>')
  })

  it('returns null for llama type', () => {
    expect(getModelFormat('llama')).toBeNull()
  })

  it('returns null for gemma type', () => {
    expect(getModelFormat('gemma')).toBeNull()
  })
})

describe('supportsEmbeddedFormat', () => {
  it('returns true for qwen and aya', () => {
    expect(supportsEmbeddedFormat('qwen')).toBe(true)
    expect(supportsEmbeddedFormat('aya')).toBe(true)
  })

  it('returns false for llama and gemma', () => {
    expect(supportsEmbeddedFormat('llama')).toBe(false)
    expect(supportsEmbeddedFormat('gemma')).toBe(false)
  })
})

describe('cleanModelOutput', () => {
  it('removes qwen end token', () => {
    const input = 'Hello world<|im_end|>'
    expect(cleanModelOutput(input, 'qwen')).toBe('Hello world')
  })

  it('removes qwen assistant start token', () => {
    const input = '<|im_start|>assistant\nHello world'
    expect(cleanModelOutput(input, 'qwen')).toBe('Hello world')
  })

  it('removes aya end token', () => {
    const input = 'Hello world<|end|>'
    expect(cleanModelOutput(input, 'aya')).toBe('Hello world')
  })

  it('removes aya assistant token', () => {
    const input = '<|assistant|>Hello world'
    expect(cleanModelOutput(input, 'aya')).toBe('Hello world')
  })

  it('removes multiple tokens', () => {
    const input = '<|im_start|>assistant\nHello<|im_end|> world<|end|>'
    expect(cleanModelOutput(input, 'qwen')).toBe('Hello world')
  })

  it('trims whitespace', () => {
    const input = '  Hello world  '
    expect(cleanModelOutput(input, 'qwen')).toBe('Hello world')
  })

  it('handles empty string', () => {
    expect(cleanModelOutput('', 'qwen')).toBe('')
  })

  it('works for all model types', () => {
    const input = 'Test<|im_end|><|end|>'
    expect(cleanModelOutput(input, 'qwen')).toBe('Test')
    expect(cleanModelOutput(input, 'aya')).toBe('Test')
    expect(cleanModelOutput(input, 'llama')).toBe('Test')
    expect(cleanModelOutput(input, 'gemma')).toBe('Test')
  })

  // The translation prompt fences the source in <text> tags so the model treats
  // it as material rather than a message to reply to. Smaller models sometimes
  // echo that fence back, and the user must never see the markup.
  describe('leaked translation fence', () => {
    it('keeps only the fenced content and drops a model preamble', () => {
      const input = 'ご依頼の内容：\n\n<text>\nメッセージに返信しないでください。\n</text>'
      expect(cleanModelOutput(input, 'aya')).toBe('メッセージに返信しないでください。')
    })

    it('strips a simple wrapped translation', () => {
      expect(cleanModelOutput('<text>Xin chào</text>', 'aya')).toBe('Xin chào')
    })

    it('still returns usable text when the closing tag is missing', () => {
      expect(cleanModelOutput('<text>\nHola', 'aya')).toBe('Hola')
    })

    it('removes a stray closing tag', () => {
      expect(cleanModelOutput('Bonjour</text>', 'aya')).toBe('Bonjour')
    })

    it('leaves ordinary output containing the word text alone', () => {
      expect(cleanModelOutput('Please send the text tomorrow.', 'aya'))
        .toBe('Please send the text tomorrow.')
    })
  })

  // A hybrid reasoner such as qwen3 emits its chain of thought inline when the
  // separate thinking channel is off. Measured on qwen3:4b, that turned a 706
  // character correction into 7606 characters of visible reasoning.
  describe('leaked chain of thought', () => {
    it('drops a complete think block', () => {
      expect(cleanModelOutput('<think>first I check the tense</think>I went to the store.', 'qwen'))
        .toBe('I went to the store.')
    })

    it('drops reasoning that arrives without an opening tag', () => {
      expect(cleanModelOutput('We are given a sentence.\nLet me reason.</think>\n\nI went.', 'qwen'))
        .toBe('I went.')
    })

    it('drops multiple think blocks', () => {
      expect(cleanModelOutput('<think>a</think>Hello <think>b</think>world', 'qwen'))
        .toBe('Hello world')
    })

    it('leaves an answer that merely mentions thinking alone', () => {
      expect(cleanModelOutput('I think we should go.', 'qwen')).toBe('I think we should go.')
    })
  })

  // qwen3 sometimes answers like a maths solution: an explanation followed by
  // the result in \boxed{}. The braces hold the answer, the prose is workings.
  describe('boxed answer', () => {
    it('keeps only the boxed text after an explanation', () => {
      const input =
        'The errors are: "stor" is misspelled.\n\n\\boxed{\\text{I went to the store yesterday.}}'
      expect(cleanModelOutput(input, 'qwen')).toBe('I went to the store yesterday.')
    })

    it('handles a boxed answer without the text wrapper', () => {
      expect(cleanModelOutput('Working...\n\\boxed{I went to the store.}', 'qwen'))
        .toBe('I went to the store.')
    })

    it('leaves output without a boxed answer untouched', () => {
      expect(cleanModelOutput('I went to the store yesterday.', 'qwen'))
        .toBe('I went to the store yesterday.')
    })
  })
})
