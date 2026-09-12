/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import appStoreSource from '../stores/appStore.ts?raw'
import correctionHookSource from '../hooks/useCorrection.ts?raw'
import typesSource from '../types/index.ts?raw'
import ollamaClientSource from '../lib/ollama-client.ts?raw'
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

// Spy on the canonical prompt API while keeping its real output, so a second
// prompt implementation cannot creep back in behind an equal-looking string.
vi.mock('../lib/prompt-builder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prompt-builder')>()
  return {
    ...actual,
    buildCorrectionPrompt: vi.fn(actual.buildCorrectionPrompt),
    buildChangesExtractionPrompt: vi.fn(actual.buildChangesExtractionPrompt),
  }
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
        0,
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

    // The pre-refactor extraction spent exactly one model call on unusable
    // JSON; the provider default of two retries would triple that cost before
    // the whole-text fallback is ever shown.
    it('asks the provider for a single attempt with no JSON retries', async () => {
      provider.generateJSON.mockRejectedValue(new Error('bad json'))
      const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

      await service.extractChanges('Hello wrold', 'Hello world', 'en', 'en')

      expect(provider.generateJSON).toHaveBeenCalledTimes(1)
      expect(provider.generateJSON.mock.calls[0][2]).toBe(0)
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

    it('detectSourceLanguage reports the detected language', () => {
      const service = new GrammarService({ modelName: 'gemma3:4b', provider })

      expect(service.detectSourceLanguage('Hello world')).toBe('en')
      expect(service.detectSourceLanguage('こんにちは')).toBe('ja')
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

describe('prompt ownership', () => {
  it('builds every correction prompt through the canonical prompt builder', async () => {
    const provider = createFakeProvider()
    provider.generateJSON.mockResolvedValue([{ from: 'wrold', to: 'world', reason: 'Typo' }])
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.correctText('Hello wrold', 'en', 'fix')
    for await (const _chunk of service.correctTextStream('Hello wrold', 'auto', 'improve')) {
      // drain
    }
    await service.extractChanges('Hello wrold', 'Hello world', 'en', 'ja')

    expect(vi.mocked(buildCorrectionPrompt)).toHaveBeenCalledWith('Hello wrold', 'en', 'fix', 'qwen2.5:7b')
    expect(vi.mocked(buildCorrectionPrompt)).toHaveBeenCalledWith('Hello wrold', 'en', 'improve', 'qwen2.5:7b')
    expect(vi.mocked(buildChangesExtractionPrompt)).toHaveBeenCalledWith(
      'Hello wrold',
      'Hello world',
      'en',
      'ja',
      'qwen2.5:7b'
    )
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

// The extraction path builds a prompt out of the whole document the user is
// correcting and receives change objects that quote that text on both sides of
// every edit. Anything this module writes to the console is therefore readable
// by anyone who opens the webview console, so the contract is that it writes
// nothing that came from the user or from the model.
describe('console hygiene', () => {
  const ORIGINAL_SENTINEL = 'ZZ-ORIGINAL-SENTINEL-ZZ'
  const CORRECTED_SENTINEL = 'ZZ-CORRECTED-SENTINEL-ZZ'
  const ERROR_SENTINEL = 'ZZ-ERROR-SENTINEL-ZZ'

  let provider: ReturnType<typeof createFakeProvider>
  let spies: Record<'log' | 'debug' | 'info' | 'warn' | 'error', ReturnType<typeof vi.spyOn>>

  beforeEach(() => {
    provider = createFakeProvider()
    spies = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function allCalls(): unknown[][] {
    return Object.values(spies).flatMap(spy => spy.mock.calls as unknown[][])
  }

  // Serializing rather than string-matching each argument catches a sentinel
  // nested inside a logged object as well as one passed directly.
  function serialized(): string {
    return allCalls()
      .map(args => args.map(arg => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`
        try {
          return JSON.stringify(arg) ?? String(arg)
        } catch {
          return String(arg)
        }
      }).join(' '))
      .join('\n')
  }

  it('writes nothing when the text is unchanged', async () => {
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.extractChanges(ORIGINAL_SENTINEL, ` ${ORIGINAL_SENTINEL} `, 'en', 'en')

    expect(allCalls()).toEqual([])
  })

  it('writes neither the built prompt nor the user text on a successful extraction', async () => {
    provider.generateJSON.mockResolvedValue([
      { from: ORIGINAL_SENTINEL, to: CORRECTED_SENTINEL, reason: 'Typo' },
    ])
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.extractChanges(ORIGINAL_SENTINEL, CORRECTED_SENTINEL, 'en', 'en')

    expect(allCalls()).toEqual([])
    expect(serialized()).not.toContain(ORIGINAL_SENTINEL)
    expect(serialized()).not.toContain(CORRECTED_SENTINEL)
  })

  it('writes nothing when the model answer filters down to no usable change', async () => {
    provider.generateJSON.mockResolvedValue([{ from: 'only-from' }, null])
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.extractChanges(ORIGINAL_SENTINEL, CORRECTED_SENTINEL, 'en', 'en')

    expect(allCalls()).toEqual([])
    expect(serialized()).not.toContain(ORIGINAL_SENTINEL)
    expect(serialized()).not.toContain(CORRECTED_SENTINEL)
  })

  // Extraction failures arrive as JSON.parse SyntaxErrors whose messages quote
  // the offending input, so a raw error here leaks model output as surely as
  // logging the response would.
  it('keeps one content-free diagnostic on the failure path and leaks no payload', async () => {
    provider.generateJSON.mockRejectedValue(
      new Error(`Unexpected token in JSON: ${ERROR_SENTINEL} near ${CORRECTED_SENTINEL}`)
    )
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.extractChanges(ORIGINAL_SENTINEL, CORRECTED_SENTINEL, 'en', 'en')

    // The diagnostic must survive — a failure that reports nothing trades one
    // defect for another.
    expect(spies.error).toHaveBeenCalledTimes(1)
    expect(spies.log).not.toHaveBeenCalled()

    const args = spies.error.mock.calls[0] as unknown[]
    expect(args).toHaveLength(1)
    expect(typeof args[0]).toBe('string')
    expect(serialized()).not.toContain(ORIGINAL_SENTINEL)
    expect(serialized()).not.toContain(CORRECTED_SENTINEL)
    expect(serialized()).not.toContain(ERROR_SENTINEL)
  })

  it('writes nothing when the extraction is cancelled', async () => {
    const abortError = new Error(ERROR_SENTINEL)
    abortError.name = 'AbortError'
    provider.generateJSON.mockRejectedValue(abortError)
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await expect(
      service.extractChanges(ORIGINAL_SENTINEL, CORRECTED_SENTINEL, 'en', 'en')
    ).rejects.toBe(abortError)

    expect(allCalls()).toEqual([])
  })

  it('writes nothing while correcting or streaming a correction', async () => {
    provider.generateFromPrompt.mockResolvedValue(CORRECTED_SENTINEL)
    const service = new GrammarService({ modelName: 'qwen2.5:7b', provider })

    await service.correctText(ORIGINAL_SENTINEL, 'en', 'fix')
    for await (const _chunk of service.correctTextStream(ORIGINAL_SENTINEL, 'en', 'fix')) {
      void _chunk
    }

    expect(allCalls()).toEqual([])
  })
})

// The retry notice in the Ollama client is the one console call in this area
// worth keeping. Its argument has to stay a fixed literal: no lexical check
// can tell an interpolated counter from an interpolated prompt, so the only
// enforceable line is that nothing is interpolated at all.
describe('retained diagnostic ownership', () => {
  const consoleCall = /console\.(log|debug|info|dir|table|trace|warn|error)\(/g

  it('keeps one console call in the ollama client', () => {
    const calls = ollamaClientSource.match(consoleCall) ?? []

    expect(calls).toEqual(['console.warn('])
  })

  it('gives that call a fixed message with nothing interpolated', () => {
    const [, argument] = ollamaClientSource.match(/console\.warn\((.*)\)/) ?? []

    expect(argument).toBeDefined()
    expect(argument).toMatch(/^'[^'$]*'$/)
  })
})
