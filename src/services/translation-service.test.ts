import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TranslationService, createTranslationService } from './translation-service'
import { OllamaClient } from '../lib/ollama-client'
import { buildTranslationPrompt } from '../lib/prompt-builder'
import type {
  AiProvider,
  GenerateOptions,
  OllamaGenerateRequest,
  OllamaModelInfo,
  PromptResult,
} from '../types'

// Spy on the canonical prompt API while keeping its real output, so a second
// prompt implementation cannot creep back in behind an equal-looking string.
vi.mock('../lib/prompt-builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prompt-builder')>()
  return { ...actual, buildTranslationPrompt: vi.fn(actual.buildTranslationPrompt) }
})

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

function createFakeProvider() {
  const fake = {
    checkHealth: vi.fn(async (_signal?: AbortSignal) => true),
    listModels: vi.fn(async (_signal?: AbortSignal): Promise<OllamaModelInfo[]> => []),
    generate: vi.fn(async (_request: OllamaGenerateRequest, _signal?: AbortSignal) => ''),
    generateStream: vi.fn(async function* (
      _request: OllamaGenerateRequest,
      _signal?: AbortSignal
    ): AsyncGenerator<string> {}),
    generateFromPrompt: vi.fn(async (
      _prompt: PromptResult,
      _model: string,
      _options?: GenerateOptions,
      _signal?: AbortSignal
    ) => 'Xin chào'),
    streamFromPrompt: vi.fn(async function* (
      _prompt: PromptResult,
      _model: string,
      _options?: GenerateOptions,
      _signal?: AbortSignal
    ): AsyncGenerator<string> {
      yield 'Xin'
      yield ' chào'
    }),
    generateJSON: vi.fn(async (
      _prompt: PromptResult,
      _model: string,
      _maxRetries?: number,
      _signal?: AbortSignal
    ): Promise<unknown> => []),
  }

  return fake as unknown as typeof fake & AiProvider
}

describe('TranslationService', () => {
  let provider: ReturnType<typeof createFakeProvider>

  beforeEach(() => {
    provider = createFakeProvider()
    mockFetch.mockReset()
  })

  describe('translate', () => {
    it('returns the cleaned translation with the resolved languages', async () => {
      provider.generateFromPrompt.mockResolvedValue('Xin chào<|im_end|>')
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      const result = await service.translate('Hello world', 'en', 'vi')

      expect(result).toEqual({
        original: 'Hello world',
        translated: 'Xin chào',
        sourceLang: 'en',
        targetLang: 'vi',
      })
    })

    it('sends the unchanged translation prompt and model to the provider', async () => {
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      await service.translate('Hello world', 'en', 'vi')

      expect(provider.generateFromPrompt).toHaveBeenCalledWith(
        buildTranslationPrompt('Hello world', 'en', 'vi', 'qwen2.5:7b'),
        'qwen2.5:7b',
        expect.anything(),
        undefined
      )
    })

    it('detects the source language when it is auto', async () => {
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      const result = await service.translate('Hello world', 'auto', 'vi')

      expect(result.sourceLang).toBe('en')
      expect(provider.generateFromPrompt).toHaveBeenCalledWith(
        buildTranslationPrompt('Hello world', 'en', 'vi', 'qwen2.5:7b'),
        'qwen2.5:7b',
        expect.anything(),
        undefined
      )
    })

    it('forwards the caller signal to the provider', async () => {
      const controller = new AbortController()
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      await service.translate('Hello world', 'en', 'vi', controller.signal)

      expect(provider.generateFromPrompt.mock.calls[0][3]).toBe(controller.signal)
    })
  })

  describe('translateStream', () => {
    it('yields the cleaned accumulated translation', async () => {
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      const chunks: string[] = []
      for await (const chunk of service.translateStream('Hello world', 'en', 'vi')) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Xin', 'Xin chào'])
    })

    it('forwards the caller signal to the provider', async () => {
      const controller = new AbortController()
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      for await (const _chunk of service.translateStream('Hello world', 'auto', 'vi', controller.signal)) {
        // drain
      }

      expect(provider.streamFromPrompt.mock.calls[0][3]).toBe(controller.signal)
    })
  })

  describe('configuration', () => {
    it('uses the updated model after setModel', async () => {
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      service.setModel('gemma3:4b')
      await service.translate('Hello world', 'en', 'vi')

      expect(provider.generateFromPrompt.mock.calls[0][1]).toBe('gemma3:4b')
    })

    it('setHost swaps in a client for the new host without mutating the injected provider', async () => {
      const service = new TranslationService({ modelName: 'gemma3:4b', provider })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Xin chào' }) })

      service.setHost('http://swapped:9999')
      await service.translate('Hello world', 'en', 'vi')

      expect(provider.generateFromPrompt).not.toHaveBeenCalled()
      expect(mockFetch.mock.calls[0][0]).toBe('http://swapped:9999/api/generate')
    })

    it('owns an Ollama client on the configured host when no provider is injected', async () => {
      const service = new TranslationService({ modelName: 'gemma3:4b', ollamaHost: 'http://configured:1234' })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Xin chào' }) })

      await service.translate('Hello world', 'en', 'vi')

      expect(mockFetch.mock.calls[0][0]).toBe('http://configured:1234/api/generate')
    })

    it('defaults to the local Ollama host', async () => {
      const service = new TranslationService({ modelName: 'gemma3:4b' })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Xin chào' }) })

      await service.translate('Hello world', 'en', 'vi')

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/api/generate')
    })

    it('detectSourceLanguage reports the detected language', () => {
      const service = new TranslationService({ modelName: 'gemma3:4b', provider })

      expect(service.detectSourceLanguage('Hello world')).toBe('en')
    })
  })

  describe('createTranslationService', () => {
    it('builds a service bound to the requested host', async () => {
      const service = createTranslationService('gemma3:4b', 'http://factory:4321')
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Xin chào' }) })

      expect(service).toBeInstanceOf(TranslationService)
      await service.translate('Hello world', 'en', 'vi')

      expect(mockFetch.mock.calls[0][0]).toBe('http://factory:4321/api/generate')
    })

    it('builds a service on the default host', () => {
      expect(createTranslationService('gemma3:4b')).toBeInstanceOf(TranslationService)
    })
  })

  describe('prompt ownership', () => {
    it('builds both prompt modes through the canonical prompt builder', async () => {
      const service = new TranslationService({ modelName: 'qwen2.5:7b', provider })

      await service.translate('Hello world', 'en', 'vi')
      for await (const _chunk of service.translateStream('Hello world', 'auto', 'vi')) {
        // drain
      }

      expect(vi.mocked(buildTranslationPrompt)).toHaveBeenCalledWith('Hello world', 'en', 'vi', 'qwen2.5:7b')
      expect(vi.mocked(buildTranslationPrompt).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('never shares a transport instance between two hosts', async () => {
    const a = new TranslationService({ modelName: 'gemma3:4b', ollamaHost: 'http://a:1111' })
    const b = new TranslationService({ modelName: 'gemma3:4b', ollamaHost: 'http://b:2222' })
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'ok' }) })

    await a.translate('Hello world', 'en', 'vi')
    await b.translate('Hello world', 'en', 'vi')
    await a.translate('Hello world', 'en', 'vi')

    expect(mockFetch.mock.calls.map(call => call[0])).toEqual([
      'http://a:1111/api/generate',
      'http://b:2222/api/generate',
      'http://a:1111/api/generate',
    ])
    expect(new OllamaClient('http://a:1111').getBaseUrl()).toBe('http://a:1111')
  })
})
