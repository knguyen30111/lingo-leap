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
})
