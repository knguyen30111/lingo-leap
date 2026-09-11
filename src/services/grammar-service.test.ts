/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import appStoreSource from '../stores/appStore.ts?raw'
import correctionHookSource from '../hooks/useCorrection.ts?raw'
import typesSource from '../types/index.ts?raw'
import { GrammarService, createGrammarService } from './grammar-service'
import { buildCorrectionPrompt, buildChangesExtractionPrompt } from '../lib/prompt-builder'
import type {
  AiProvider,
  Change,
  GenerateOptions,
  OllamaGenerateRequest,
  OllamaModelInfo,
  PromptResult,
} from '../types'

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
    ) => 'Hello world'),
    streamFromPrompt: vi.fn(async function* (
      _prompt: PromptResult,
      _model: string,
      _options?: GenerateOptions,
      _signal?: AbortSignal
    ): AsyncGenerator<string> {
      yield 'Hello'
      yield ' world'
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

describe('GrammarService', () => {
  let provider: ReturnType<typeof createFakeProvider>

  beforeEach(() => {
    provider = createFakeProvider()
    mockFetch.mockReset()
  })

  describe('correctText', () => {
    it('returns the cleaned correction', async () => {
      provider.generateFromPrompt.mockResolvedValue('Hello world<|im_end|>')
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(service.correctText('Hello wrold', 'en', 'fix')).resolves.toBe('Hello world')
    })

    it('sends the unchanged correction prompt and model', async () => {
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.correctText('Hello wrold', 'en', 'improve')

      expect(provider.generateFromPrompt).toHaveBeenCalledWith(
        buildCorrectionPrompt('Hello wrold', 'en', 'improve', 'qwen2.5:7b'),
        'qwen2.5:7b',
        expect.anything(),
        undefined
      )
    })

    it('detects the language when it is auto', async () => {
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.correctText('Hello wrold', 'auto', 'fix')

      expect(provider.generateFromPrompt).toHaveBeenCalledWith(
        buildCorrectionPrompt('Hello wrold', 'en', 'fix', 'qwen2.5:7b'),
        'qwen2.5:7b',
        expect.anything(),
        undefined
      )
    })

    it('forwards the caller signal', async () => {
      const controller = new AbortController()
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.correctText('Hello wrold', 'en', 'fix', controller.signal)

      expect(provider.generateFromPrompt.mock.calls[0][3]).toBe(controller.signal)
    })
  })

  describe('correctTextStream', () => {
    it('yields the cleaned accumulated correction', async () => {
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      const chunks: string[] = []
      for await (const chunk of service.correctTextStream('Hello wrold', 'en', 'fix')) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(['Hello', 'Hello world'])
    })

    it('forwards the caller signal and detects auto language', async () => {
      const controller = new AbortController()
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      for await (const _chunk of service.correctTextStream('Hello wrold', 'auto', 'fix', controller.signal)) {
        // drain
      }

      expect(provider.streamFromPrompt.mock.calls[0][0]).toEqual(
        buildCorrectionPrompt('Hello wrold', 'en', 'fix', 'qwen2.5:7b')
      )
      expect(provider.streamFromPrompt.mock.calls[0][3]).toBe(controller.signal)
    })
  })

  describe('extractChanges', () => {
    it('returns an empty list when the text is unchanged', async () => {
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(service.extractChanges('Same text', ' Same text ', 'en', 'en')).resolves.toEqual([])
      expect(provider.generateJSON).not.toHaveBeenCalled()
    })

    it('sends the unchanged extraction prompt and filters invalid entries', async () => {
      provider.generateJSON.mockResolvedValue([
        { from: 'wrold', to: 'world', reason: 'Typo' },
        { from: 'only-from' },
        null,
        { from: 'a', to: 'b' },
      ])
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      const changes = await service.extractChanges('Hello wrold', 'Hello world', 'en', 'ja')

      expect(provider.generateJSON).toHaveBeenCalledWith(
        buildChangesExtractionPrompt('Hello wrold', 'Hello world', 'en', 'ja', 'qwen2.5:7b'),
        'qwen2.5:7b',
        undefined,
        undefined
      )
      expect(changes).toEqual([
        { from: 'wrold', to: 'world', reason: 'Typo' },
        { from: 'a', to: 'b', reason: '' },
      ])
    })

    it('forwards the caller signal', async () => {
      const controller = new AbortController()
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.extractChanges('Hello wrold', 'Hello world', 'en', 'en', controller.signal)

      expect(provider.generateJSON.mock.calls[0][3]).toBe(controller.signal)
    })

    it('falls back to a whole-text change when extraction fails', async () => {
      provider.generateJSON.mockRejectedValue(new Error('bad json'))
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(
        service.extractChanges(' Hello wrold ', ' Hello world ', 'en', 'en')
      ).resolves.toEqual([
        { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
      ])
    })

    // The fallback reason is rendered in the changes panel, so it is a
    // user-visible string and must stay exactly what the desktop app shows.
    it('uses the exact shipped fallback reason', async () => {
      provider.generateJSON.mockRejectedValue(new Error('bad json'))
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      const changes = await service.extractChanges('Hello wrold', 'Hello world', 'en', 'en')

      expect(changes[0].reason).toBe('Text was corrected/improved')
    })

    it('falls back when the model answers with no usable change entry', async () => {
      provider.generateJSON.mockResolvedValue([])
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(
        service.extractChanges('Hello wrold', 'Hello world', 'en', 'en')
      ).resolves.toEqual([
        { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
      ])
    })

    it('falls back when every returned entry is malformed', async () => {
      provider.generateJSON.mockResolvedValue([{ from: 'only-from' }, null])
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(
        service.extractChanges('Hello wrold', 'Hello world', 'en', 'en')
      ).resolves.toEqual([
        { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
      ])
    })

    it('propagates an AbortError instead of falling back', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      provider.generateJSON.mockRejectedValue(abortError)
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(
        service.extractChanges('Hello wrold', 'Hello world', 'en', 'en')
      ).rejects.toBe(abortError)
    })

    it('propagates a failure raised under an already-aborted signal', async () => {
      const controller = new AbortController()
      controller.abort()
      const failure = new Error('fetch failed')
      provider.generateJSON.mockRejectedValue(failure)
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await expect(
        service.extractChanges('Hello wrold', 'Hello world', 'en', 'en', controller.signal)
      ).rejects.toBe(failure)
    })
  })

  describe('correctAndExplain', () => {
    it('returns the correction with its extracted changes', async () => {
      provider.generateFromPrompt.mockResolvedValue('Hello world')
      provider.generateJSON.mockResolvedValue([{ from: 'wrold', to: 'world', reason: 'Typo' }] as Change[])
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      const result = await service.correctAndExplain('Hello wrold', 'auto', 'auto', 'fix')

      expect(result).toEqual({
        original: 'Hello wrold',
        corrected: 'Hello world',
        changes: [{ from: 'wrold', to: 'world', reason: 'Typo' }],
        language: 'en',
      })
      expect(provider.generateJSON.mock.calls[0][0]).toEqual(
        buildChangesExtractionPrompt('Hello wrold', 'Hello world', 'en', 'en', 'qwen2.5:7b')
      )
    })

    it('uses the explicit explanation language', async () => {
      provider.generateFromPrompt.mockResolvedValue('Hello world')
      provider.generateJSON.mockResolvedValue([{ from: 'wrold', to: 'world', reason: 'Typo' }] as Change[])
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.correctAndExplain('Hello wrold', 'en', 'ja', 'fix')

      expect(provider.generateJSON.mock.calls[0][0]).toEqual(
        buildChangesExtractionPrompt('Hello wrold', 'Hello world', 'en', 'ja', 'qwen2.5:7b')
      )
    })

    it('forwards the caller signal to both steps', async () => {
      const controller = new AbortController()
      provider.generateFromPrompt.mockResolvedValue('Hello world')
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.correctAndExplain('Hello wrold', 'en', 'en', 'fix', controller.signal)

      expect(provider.generateFromPrompt.mock.calls[0][3]).toBe(controller.signal)
      expect(provider.generateJSON.mock.calls[0][3]).toBe(controller.signal)
    })
  })

  describe('configuration', () => {
    it('uses the updated model after setModel', async () => {
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      service.setModel('gemma3:4b')
      await service.correctText('Hello wrold', 'en', 'fix')

      expect(provider.generateFromPrompt.mock.calls[0][1]).toBe('gemma3:4b')
    })

    it('setHost swaps in a client for the new host without mutating the injected provider', async () => {
      const service = new GrammarService({ modelName: 'gemma3:4b', provider })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Hello world' }) })

      service.setHost('http://swapped:9999')
      await service.correctText('Hello wrold', 'en', 'fix')

      expect(provider.generateFromPrompt).not.toHaveBeenCalled()
      expect(mockFetch.mock.calls[0][0]).toBe('http://swapped:9999/api/generate')
    })

    it('owns an Ollama client on the configured host when no provider is injected', async () => {
      const service = new GrammarService({ modelName: 'gemma3:4b', ollamaHost: 'http://configured:1234' })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Hello world' }) })

      await service.correctText('Hello wrold', 'en', 'fix')

      expect(mockFetch.mock.calls[0][0]).toBe('http://configured:1234/api/generate')
    })

    it('defaults to the local Ollama host', async () => {
      const service = new GrammarService({ modelName: 'gemma3:4b' })
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Hello world' }) })

      await service.correctText('Hello wrold', 'en', 'fix')

      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/api/generate')
    })
  })

  describe('createGrammarService', () => {
    it('builds a service bound to the requested host', async () => {
      const service = createGrammarService('gemma3:4b', 'http://factory:4321')
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ response: 'Hello world' }) })

      expect(service).toBeInstanceOf(GrammarService)
      await service.correctText('Hello wrold', 'en', 'fix')

      expect(mockFetch.mock.calls[0][0]).toBe('http://factory:4321/api/generate')
    })

    it('builds a service on the default host', () => {
      expect(createGrammarService('gemma3:4b')).toBeInstanceOf(GrammarService)
    })
  })
})

describe('domain type ownership', () => {
  const sources = {
    'src/types/index.ts': typesSource,
    'src/stores/appStore.ts': appStoreSource,
    'src/hooks/useCorrection.ts': correctionHookSource,
  }

  it.each(['CorrectionLevel', 'Change'])(
    'declares %s exactly once across the correction sources',
    (typeName) => {
      const declaringFiles = Object.entries(sources)
        .filter(([, source]) =>
          new RegExp(`^\\s*(export\\s+)?(type|interface)\\s+${typeName}\\b`, 'm').test(source)
        )
        .map(([file]) => file)

      expect(declaringFiles).toEqual(['src/types/index.ts'])
    }
  )
})
