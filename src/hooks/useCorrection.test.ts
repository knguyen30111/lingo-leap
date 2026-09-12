/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCorrection } from './useCorrection'
import correctionHookSource from './useCorrection.ts?raw'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { correctionResultCache, createCorrectionCacheKey } from '../lib/cache'

// Mock the grammar task service: the hook owns state, cache, and request
// lifecycle only, so every prompt, transport, and parsing detail is the
// service's and must be observable here as a plain service call.
const grammar = vi.hoisted(() => ({
  constructorOptions: [] as Array<{ modelName: string; ollamaHost?: string }>,
  correctText: vi.fn(),
  correctTextStream: vi.fn(),
  extractChanges: vi.fn(),
  detectSourceLanguage: vi.fn(),
}))

vi.mock('../services/grammar-service', () => ({
  GrammarService: class MockGrammarService {
    correctText = grammar.correctText
    correctTextStream = grammar.correctTextStream
    extractChanges = grammar.extractChanges
    detectSourceLanguage = grammar.detectSourceLanguage

    constructor(options: { modelName: string; ollamaHost?: string }) {
      grammar.constructorOptions.push(options)
    }
  },
}))

// The real key builder is contract-tested in `src/lib/cache.test.ts`; the
// readable stand-in key here only has to prove which request identity the hook
// handed over.
const cache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  createCorrectionCacheKey: vi.fn(
    async (input: {
      endpoint: string
      model: string
      language: string
      level: string
      input: string
    }) => `${input.input}-${input.language}-${input.level}-${input.model}`
  ),
}))

vi.mock('../lib/cache', () => ({
  correctionResultCache: { get: cache.get, set: cache.set },
  createCorrectionCacheKey: cache.createCorrectionCacheKey,
}))

function resetEnvironment() {
  useAppStore.setState({
    mode: 'correct',
    inputText: 'Hello wrold',
    outputText: '',
    correctionLevel: 'fix',
    latestDetectedSourceLang: null,
    isLoading: false,
    error: null,
    changes: [],
    isChangesLoading: false,
  })

  useSettingsStore.setState({
    correctionModel: 'gemma3:4b',
    ollamaHost: 'http://localhost:11434',
    useStreaming: false,
    explanationLang: 'auto',
  })

  grammar.constructorOptions.length = 0
  grammar.correctText.mockReset().mockResolvedValue('Hello world')
  grammar.correctTextStream.mockReset()
  grammar.extractChanges.mockReset().mockResolvedValue([])
  grammar.detectSourceLanguage.mockReset().mockReturnValue('en')
  vi.mocked(correctionResultCache.get).mockReset()
  vi.mocked(correctionResultCache.set).mockReset()
  vi.mocked(createCorrectionCacheKey).mockReset()
}

async function* streamOf(...chunks: string[]): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk
}

describe('useCorrection', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct, setLevel, and cancel functions', () => {
    const { result } = renderHook(() => useCorrection())

    expect(typeof result.current.correct).toBe('function')
    expect(typeof result.current.setLevel).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })

  it('corrects text with non-streaming mode', async () => {
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('corrects text with streaming mode', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.correctTextStream.mockReturnValue(streamOf('Hello', 'Hello world'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(grammar.correctText).not.toHaveBeenCalled()
  })

  it('publishes the service output without re-cleaning it', async () => {
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
  })

  it('uses cached result when available', async () => {
    vi.mocked(correctionResultCache.get).mockReturnValue('Cached result')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      const res = await result.current.correct()
      expect(res).toBe('Cached result')
    })

    expect(useAppStore.getState().outputText).toBe('Cached result')
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(grammar.correctText).not.toHaveBeenCalled()
  })

  it('skips cache when skipCache option is true', async () => {
    vi.mocked(correctionResultCache.get).mockReturnValue('Cached result')
    grammar.correctText.mockResolvedValue('Fresh result')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, undefined, { skipCache: true })
    })

    expect(grammar.correctText).toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Fresh result')
  })

  it('does nothing for empty input', async () => {
    useAppStore.setState({ inputText: '' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctText).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only input', async () => {
    useAppStore.setState({ inputText: '   ' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctText).not.toHaveBeenCalled()
  })

  it('handles error during correction', async () => {
    grammar.correctText.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toThrow('Server error')

    expect(useAppStore.getState().error).toBe('Server error')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    grammar.correctText.mockRejectedValue('string error')

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toBe('string error')

    expect(useAppStore.getState().error).toBe('Correction failed')
  })

  it('caches result after correction', async () => {
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(correctionResultCache.set).toHaveBeenCalledWith(
      'Hello wrold-en-fix-gemma3:4b',
      'Hello world'
    )
  })

  it('setLevel updates correction level', () => {
    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.setLevel('rewrite')
    })

    expect(useAppStore.getState().correctionLevel).toBe('rewrite')
  })

  it('cancel stops ongoing correction', async () => {
    let resolveCorrect: (value: string) => void
    grammar.correctText.mockReturnValue(
      new Promise((resolve) => {
        resolveCorrect = resolve
      })
    )

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    act(() => {
      result.current.cancel()
    })

    expect(useAppStore.getState().isLoading).toBe(false)

    resolveCorrect!('Cancelled')
  })

  it('corrects with custom text parameter', async () => {
    grammar.correctText.mockResolvedValue('Custom corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('Custom text')
    })

    expect(grammar.correctText.mock.calls[0][0]).toBe('Custom text')
    expect(useAppStore.getState().outputText).toBe('Custom corrected')
  })

  it('corrects with custom level parameter', async () => {
    grammar.correctText.mockResolvedValue('Heavy corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, 'rewrite')
    })

    expect(grammar.correctText.mock.calls[0][2]).toBe('rewrite')
  })

  it('sets loading state during correction', async () => {
    let resolveCorrect: (value: string) => void
    grammar.correctText.mockReturnValue(
      new Promise((resolve) => {
        resolveCorrect = resolve
      })
    )

    const { result } = renderHook(() => useCorrection())

    let correctPromise!: Promise<string | undefined>
    act(() => {
      correctPromise = result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    await act(async () => {
      resolveCorrect!('Done')
      await correctPromise
    })
  })
})

describe('useCorrection service composition', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('builds the grammar service from the configured model and host', async () => {
    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.constructorOptions).toEqual([
      { modelName: 'gemma3:4b', ollamaHost: 'http://localhost:11434' },
    ])
  })

  it('resolves the correction language through the service helper', async () => {
    grammar.detectSourceLanguage.mockReturnValue('ja')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('テスト')
    })

    expect(grammar.detectSourceLanguage).toHaveBeenCalledWith('テスト')
    expect(grammar.correctText.mock.calls[0][1]).toBe('ja')
  })

  it('calls the primary correction and the background extraction service methods', async () => {
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctText.mock.calls[0].slice(0, 3)).toEqual(['Hello wrold', 'en', 'fix'])
    await waitFor(() => expect(grammar.extractChanges).toHaveBeenCalled())
    expect(grammar.extractChanges.mock.calls[0].slice(0, 4)).toEqual([
      'Hello wrold',
      'Hello world',
      'en',
      'en',
    ])
  })

  it('keeps transport, prompt, detector, cleanup, and parser code out of the hook', () => {
    const forbidden = [
      /OllamaClient/,
      /lib\/prompts/,
      /getCorrectionPrompt/,
      /getChangesExtractionPrompt/,
      /buildCorrectionPrompt/,
      /buildChangesExtractionPrompt/,
      /detectLanguage/,
      /cleanModelOutput/,
      /JSON\.parse/,
      /<\|im_end\|>/,
    ]

    const violations = forbidden.filter(pattern => pattern.test(correctionHookSource))

    expect(violations).toEqual([])
  })
})

describe('useCorrection changes extraction', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('publishes extracted changes when text is modified', async () => {
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockResolvedValue([{ from: 'wrold', to: 'world', reason: 'Typo' }])

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().changes).toEqual([
        { from: 'wrold', to: 'world', reason: 'Typo' },
      ])
    })
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('returns the correction before the background extraction completes', async () => {
    let resolveExtraction: (changes: Array<{ from: string; to: string; reason: string }>) => void
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockReturnValue(
      new Promise((resolve) => {
        resolveExtraction = resolve
      })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await expect(result.current.correct()).resolves.toBe('Hello world')
    })

    // The primary correction is already published while extraction is pending.
    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(useAppStore.getState().isChangesLoading).toBe(true)
    expect(useAppStore.getState().changes).toEqual([])

    await act(async () => {
      resolveExtraction!([{ from: 'wrold', to: 'world', reason: 'Typo' }])
    })

    expect(useAppStore.getState().changes).toEqual([
      { from: 'wrold', to: 'world', reason: 'Typo' },
    ])
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('publishes the service fallback change with its exact reason', async () => {
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockResolvedValue([
      { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
    ])

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().changes).toEqual([
        { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
      ])
    })
  })

  it('extracts changes from a cached result', async () => {
    vi.mocked(correctionResultCache.get).mockReturnValue('Cached result')
    grammar.extractChanges.mockResolvedValue([{ from: 'wrold', to: 'world', reason: 'Typo' }])

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Cached result')
    await waitFor(() => expect(grammar.extractChanges).toHaveBeenCalled())
    expect(grammar.extractChanges.mock.calls[0].slice(0, 2)).toEqual(['Hello wrold', 'Cached result'])
    expect(correctionResultCache.set).not.toHaveBeenCalled()
  })

  it('does not extract changes when the cached result equals the input', async () => {
    vi.mocked(correctionResultCache.get).mockReturnValue('Hello wrold')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.extractChanges).not.toHaveBeenCalled()
  })

  it('does not extract changes when the result equals the input', async () => {
    grammar.correctText.mockResolvedValue('Hello wrold')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.extractChanges).not.toHaveBeenCalled()
  })

  it('cleans nothing and publishes no change when the service returns none', async () => {
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockResolvedValue([])

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => expect(useAppStore.getState().isChangesLoading).toBe(false))
    expect(useAppStore.getState().changes).toEqual([])
  })
})

describe('useCorrection explanation language', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the detected language when explanationLang is auto', async () => {
    useSettingsStore.setState({ explanationLang: 'auto' })
    grammar.detectSourceLanguage.mockReturnValue('vi')
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => expect(grammar.extractChanges).toHaveBeenCalled())
    expect(grammar.extractChanges.mock.calls[0][3]).toBe('vi')
  })

  it('uses the configured language when explanationLang is set', async () => {
    useSettingsStore.setState({ explanationLang: 'ja' })
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => expect(grammar.extractChanges).toHaveBeenCalled())
    expect(grammar.extractChanges.mock.calls[0][3]).toBe('ja')
  })
})

describe('useCorrection cancellation and races', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards a request signal to the correction and extraction calls', async () => {
    grammar.correctText.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    await waitFor(() => expect(grammar.extractChanges).toHaveBeenCalled())

    expect(grammar.correctText.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
    expect(grammar.extractChanges.mock.calls[0][4]).toBeInstanceOf(AbortSignal)
    expect(grammar.extractChanges.mock.calls[0][4]).toBe(grammar.correctText.mock.calls[0][3])
  })

  it('forwards a request signal to the streaming correction call', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.correctTextStream.mockReturnValue(streamOf('Hello world'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctTextStream.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
  })

  it('does not publish or cache a cancelled correction', async () => {
    let resolveCorrect: (value: string) => void
    grammar.correctText.mockReturnValue(new Promise(resolve => { resolveCorrect = resolve }))

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      resolveCorrect!('Late correction')
    })

    expect(useAppStore.getState().outputText).toBe('')
    expect(correctionResultCache.set).not.toHaveBeenCalled()
    expect(grammar.extractChanges).not.toHaveBeenCalled()
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('lets only the newest overlapping correction publish and cache', async () => {
    const resolvers: ((value: string) => void)[] = []
    grammar.correctText.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      result.current.correct('first text')
    })
    await act(async () => {
      result.current.correct('second text')
    })

    await act(async () => {
      resolvers[1]('SECOND')
    })
    await act(async () => {
      resolvers[0]('FIRST')
    })

    expect(useAppStore.getState().outputText).toBe('SECOND')
    expect(correctionResultCache.set).toHaveBeenCalledTimes(1)
    expect(correctionResultCache.set).toHaveBeenCalledWith(expect.stringContaining('second text'), 'SECOND')
  })

  it('ignores stream chunks from a superseded correction', async () => {
    useSettingsStore.setState({ useStreaming: true })

    let releaseFirst: () => void
    const gate = new Promise<void>(resolve => { releaseFirst = resolve })

    async function* firstStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }

    grammar.correctTextStream
      .mockReturnValueOnce(firstStream())
      .mockReturnValueOnce(streamOf('second'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      result.current.correct('first text')
    })
    expect(useAppStore.getState().outputText).toBe('first-a')

    await act(async () => {
      await result.current.correct('second text')
    })
    expect(useAppStore.getState().outputText).toBe('second')

    await act(async () => {
      releaseFirst!()
    })

    expect(useAppStore.getState().outputText).toBe('second')
    expect(correctionResultCache.set).toHaveBeenCalledTimes(1)
    expect(correctionResultCache.set).toHaveBeenCalledWith(expect.any(String), 'second')
  })

  it('ignores a superseded background change extraction', async () => {
    const extractionResolvers: ((changes: unknown[]) => void)[] = []
    grammar.correctText.mockResolvedValue('First corrected')
    grammar.extractChanges.mockImplementation(
      () => new Promise(resolve => { extractionResolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('first text')
    })
    await waitFor(() => expect(extractionResolvers.length).toBe(1))

    act(() => {
      result.current.correct('second text')
    })

    await act(async () => {
      extractionResolvers[0]([{ from: 'stale', to: 'stale', reason: 'stale' }])
    })

    expect(useAppStore.getState().changes).toEqual([])
  })

  it('does not publish a service fallback from a superseded extraction', async () => {
    const extractionResolvers: ((changes: unknown[]) => void)[] = []
    grammar.correctText.mockResolvedValue('First corrected')
    grammar.extractChanges.mockImplementation(
      () => new Promise(resolve => { extractionResolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('first text')
    })
    await waitFor(() => expect(extractionResolvers.length).toBe(1))

    act(() => {
      result.current.correct('second text')
    })

    await act(async () => {
      extractionResolvers[0]([
        { from: 'first text', to: 'First corrected', reason: 'Text was corrected/improved' },
      ])
    })

    expect(useAppStore.getState().changes).toEqual([])
  })

  it('does not publish a retired extraction that rejects after cancel', async () => {
    const rejecters: ((reason: unknown) => void)[] = []
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockImplementation(
      () => new Promise((_resolve, reject) => { rejecters.push(reject) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    await waitFor(() => expect(rejecters.length).toBe(1))
    expect(useAppStore.getState().isChangesLoading).toBe(true)

    act(() => {
      result.current.cancel()
    })

    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    await act(async () => {
      rejecters[0](abortError)
    })

    expect(useAppStore.getState().changes).toEqual([])
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('stops the changes spinner if an extraction rejects while it is current', async () => {
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockRejectedValue(new Error('extraction failed'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => expect(useAppStore.getState().isChangesLoading).toBe(false))
    expect(useAppStore.getState().changes).toEqual([])
    expect(useAppStore.getState().error).toBeNull()
  })

  // A rejection reaching this handler carries whatever the service failed on,
  // which for an extraction is the user's own text quoted back inside a parser
  // error. The diagnostic stays; the payload does not.
  it('keeps the extraction-failure diagnostic content-free', async () => {
    const EXTRACTION_SENTINEL = 'ZZ-EXTRACTION-SENTINEL-ZZ'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    grammar.correctText.mockResolvedValue('Hello world')
    grammar.extractChanges.mockRejectedValue(new Error(EXTRACTION_SENTINEL))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1))
    const args = errorSpy.mock.calls[0] as unknown[]
    expect(args).toHaveLength(1)
    expect(typeof args[0]).toBe('string')
    expect(args[0] as string).not.toContain(EXTRACTION_SENTINEL)

    errorSpy.mockRestore()
  })

  it('ignores AbortError during correction', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    grammar.correctText.mockRejectedValue(abortError)

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().error).toBeNull()
  })

  it('does not report an error for a correction cancelled by unmount', async () => {
    let rejectCorrect: (reason: unknown) => void
    grammar.correctText.mockReturnValue(new Promise((_resolve, reject) => { rejectCorrect = reject }))

    const { result, unmount } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    unmount()

    await act(async () => {
      rejectCorrect!(new Error('Server error'))
    })

    expect(useAppStore.getState().error).toBeNull()
  })
})

describe('useCorrection settings invalidation', () => {
  const settingsChanges = [
    ['the correction model', { correctionModel: 'other-model:1b' }],
    ['the explanation language', { explanationLang: 'ja' }],
    ['the Ollama host', { ollamaHost: 'http://other-host:11434' }],
    ['the streaming setting', { useStreaming: true }],
  ] as const

  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each(settingsChanges)(
    'aborts and retires an in-flight correction when %s changes',
    async (_label, change) => {
      let resolveCorrect: (value: string) => void
      grammar.correctText.mockReturnValue(new Promise(resolve => { resolveCorrect = resolve }))

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        useSettingsStore.setState(change)
      })

      expect(grammar.correctText.mock.calls[0][3].aborted).toBe(true)

      await act(async () => {
        resolveCorrect!('Stale correction')
      })

      expect(useAppStore.getState().outputText).toBe('')
      expect(correctionResultCache.set).not.toHaveBeenCalled()
      expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().isLoading).toBe(false)
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )

  it.each(settingsChanges)(
    'does not report an error from a correction retired by a change to %s',
    async (_label, change) => {
      let rejectCorrect: (reason: unknown) => void
      grammar.correctText.mockReturnValue(new Promise((_resolve, reject) => { rejectCorrect = reject }))

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        useSettingsStore.setState(change)
      })

      await act(async () => {
        rejectCorrect!(new Error('Server error'))
      })

      expect(useAppStore.getState().error).toBeNull()
      expect(useAppStore.getState().outputText).toBe('')
    }
  )

  it.each(settingsChanges)(
    'aborts and retires a background change extraction when %s changes',
    async (_label, change) => {
      const extractionResolvers: ((changes: unknown[]) => void)[] = []
      grammar.correctText.mockResolvedValue('First corrected')
      grammar.extractChanges.mockImplementation(
        () => new Promise(resolve => { extractionResolvers.push(resolve) })
      )

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct('first text')
      })
      await waitFor(() => expect(extractionResolvers.length).toBe(1))
      expect(useAppStore.getState().isChangesLoading).toBe(true)

      act(() => {
        useSettingsStore.setState(change)
      })

      expect(grammar.extractChanges.mock.calls[0][4].aborted).toBe(true)

      await act(async () => {
        extractionResolvers[0]([{ from: 'stale', to: 'stale', reason: 'stale' }])
      })

      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )
})

describe('useCorrection detected language', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reports the detected language of a published correction', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctText.mock.calls[0][1]).toBe('fr')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('reports the detected language of a streamed correction', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.detectSourceLanguage.mockReturnValue('fr')
    grammar.correctTextStream.mockReturnValue(streamOf('Hello', 'Hello world'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctTextStream.mock.calls[0][1]).toBe('fr')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('reports the detected language of a cached correction', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    vi.mocked(correctionResultCache.get).mockReturnValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(correctionResultCache.get).toHaveBeenCalledWith('Hello wrold-fr-fix-gemma3:4b')
    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('leaves the selected translation source language untouched', async () => {
    useAppStore.setState({ sourceLang: 'auto' })
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().sourceLang).toBe('auto')
  })

  it('does not report a detected language for a cancelled correction', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    let resolveCorrect: (value: string) => void
    grammar.correctText.mockReturnValue(new Promise(resolve => { resolveCorrect = resolve }))

    const { result } = renderHook(() => useCorrection())

    let pending!: Promise<string | undefined>
    act(() => {
      pending = result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      resolveCorrect!('Late correction')
      await pending
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
  })

  it('lets only the newest correction report its detected language', async () => {
    grammar.detectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')
    const resolvers: ((value: string) => void)[] = []
    grammar.correctText.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    let first!: Promise<string | undefined>
    let second!: Promise<string | undefined>
    await act(async () => {
      first = result.current.correct('first text')
    })
    await act(async () => {
      second = result.current.correct('second text')
    })

    await act(async () => {
      resolvers[1]('SECOND')
      await second
    })
    await act(async () => {
      resolvers[0]('FIRST')
      await first
    })

    expect(useAppStore.getState().outputText).toBe('SECOND')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
  })

  it('ignores a resumed stream chunk from a superseded correction detection', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.detectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')

    let releaseFirst: () => void
    const gate = new Promise<void>(resolve => { releaseFirst = resolve })

    async function* firstStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }

    grammar.correctTextStream
      .mockReturnValueOnce(firstStream())
      .mockReturnValueOnce(streamOf('second'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      result.current.correct('first text')
    })
    await act(async () => {
      await result.current.correct('second text')
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')

    await act(async () => {
      releaseFirst!()
    })

    expect(useAppStore.getState().outputText).toBe('second')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
  })

  it('never reports a detected language from a background extraction', async () => {
    grammar.detectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')
    grammar.correctText.mockResolvedValue('First corrected')
    const extractionResolvers: ((changes: unknown[]) => void)[] = []
    grammar.extractChanges.mockImplementation(
      () => new Promise(resolve => { extractionResolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('first text')
    })
    await waitFor(() => expect(extractionResolvers.length).toBe(1))

    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')

    await act(async () => {
      await result.current.correct('second text')
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')

    await act(async () => {
      extractionResolvers[0]([{ from: 'stale', to: 'stale', reason: 'stale' }])
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
    expect(useAppStore.getState().changes).toEqual([])
    expect(grammar.extractChanges.mock.calls[0][2]).toBe('fr')
  })
})

describe('useCorrection cache identity', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('asks for a key built from the exact endpoint, model, language, and level', async () => {
    useSettingsStore.setState({
      correctionModel: ' Gemma3:4B ',
      ollamaHost: 'HTTP://localhost:11434/?x=1',
      explanationLang: 'ja',
    })
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, 'rewrite')
    })

    // Exact equality: the transport strings pass through untouched, the level
    // is part of the request identity, and the explanation language is not —
    // it only decides the language of the background explanation.
    expect(createCorrectionCacheKey).toHaveBeenCalledWith({
      endpoint: 'HTTP://localhost:11434/?x=1',
      model: ' Gemma3:4B ',
      language: 'fr',
      level: 'rewrite',
      input: 'Hello wrold',
    })
  })

  it('addresses a streamed and a whole correction as one entry', async () => {
    grammar.correctTextStream.mockImplementation(() => streamOf('Hello world'))

    const { result, rerender } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    const wholeKeyInput = vi.mocked(createCorrectionCacheKey).mock.calls[0][0]

    act(() => {
      useSettingsStore.setState({ useStreaming: true })
    })
    rerender()

    await act(async () => {
      await result.current.correct()
    })
    const streamedKeyInput = vi.mocked(createCorrectionCacheKey).mock.calls[1][0]

    expect(grammar.correctTextStream).toHaveBeenCalledTimes(1)
    expect(streamedKeyInput).toEqual(wholeKeyInput)
  })

  it('does not touch the cache for a correction cancelled while its key is built', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    let releaseKey!: (key: string) => void
    vi.mocked(createCorrectionCacheKey).mockImplementationOnce(
      () => new Promise<string>(resolve => { releaseKey = resolve })
    )

    const { result } = renderHook(() => useCorrection())

    let pending!: Promise<string | undefined>
    await act(async () => {
      pending = result.current.correct()
    })

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      releaseKey('Hello wrold-fr-fix-gemma3:4b')
      await pending
    })

    expect(correctionResultCache.get).not.toHaveBeenCalled()
    expect(correctionResultCache.set).not.toHaveBeenCalled()
    expect(grammar.correctText).not.toHaveBeenCalled()
    expect(grammar.correctTextStream).not.toHaveBeenCalled()
    expect(grammar.extractChanges).not.toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('')
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
    expect(useAppStore.getState().error).toBeNull()
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('does not start a superseded correction whose key arrives late', async () => {
    let releaseFirstKey!: (key: string) => void
    vi.mocked(createCorrectionCacheKey).mockImplementationOnce(
      () => new Promise<string>(resolve => { releaseFirstKey = resolve })
    )

    const { result } = renderHook(() => useCorrection())

    let older!: Promise<string | undefined>
    await act(async () => {
      older = result.current.correct('first text')
    })

    await act(async () => {
      await result.current.correct('second text')
    })

    await act(async () => {
      releaseFirstKey('first text-en-fix-gemma3:4b')
      await older
    })

    expect(grammar.correctText).toHaveBeenCalledTimes(1)
    expect(grammar.correctText.mock.calls[0][0]).toBe('second text')
    expect(correctionResultCache.get).toHaveBeenCalledTimes(1)
    expect(correctionResultCache.get).toHaveBeenCalledWith('second text-en-fix-gemma3:4b')
    expect(correctionResultCache.set).toHaveBeenCalledTimes(1)
    expect(correctionResultCache.set).toHaveBeenCalledWith(
      'second text-en-fix-gemma3:4b',
      'Hello world'
    )
  })
})

describe('useCorrection request retirement', () => {
  beforeEach(resetEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('publishes an explicit text that differs from the stored input', async () => {
    useAppStore.setState({ inputText: 'Stored input' })
    grammar.detectSourceLanguage.mockReturnValue('fr')
    grammar.correctText.mockResolvedValue('Custom corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('Custom text')
    })

    expect(grammar.detectSourceLanguage).toHaveBeenCalledWith('Custom text')
    expect(grammar.correctText.mock.calls[0][0]).toBe('Custom text')
    expect(correctionResultCache.set).toHaveBeenCalledWith(
      'Custom text-fr-fix-gemma3:4b',
      'Custom corrected'
    )
    expect(grammar.extractChanges.mock.calls[0][0]).toBe('Custom text')
    expect(useAppStore.getState().outputText).toBe('Custom corrected')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('publishes an explicit level that differs from the stored level', async () => {
    useAppStore.setState({ correctionLevel: 'fix' })
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, 'rewrite')
    })

    expect(grammar.correctText.mock.calls[0][2]).toBe('rewrite')
    expect(correctionResultCache.get).toHaveBeenCalledWith('Hello wrold-fr-rewrite-gemma3:4b')
    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  const storeChanges = [
    ['the input text', () => useAppStore.getState().setInputText('Later text')],
    ['the correction level', () => useAppStore.getState().setCorrectionLevel('rewrite')],
    ['the mode', () => useAppStore.getState().setMode('translate')],
  ] as const

  it.each(storeChanges)(
    'aborts and retires an in-flight correction when %s changes',
    async (_label, mutate) => {
      grammar.detectSourceLanguage.mockReturnValue('fr')
      let resolveCorrect: (value: string) => void
      grammar.correctText.mockReturnValue(new Promise(resolve => { resolveCorrect = resolve }))

      const { result } = renderHook(() => useCorrection())

      let pending!: Promise<string | undefined>
      act(() => {
        pending = result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        mutate()
      })

      expect(grammar.correctText.mock.calls[0][3].aborted).toBe(true)
      expect(useAppStore.getState().isLoading).toBe(false)
      expect(useAppStore.getState().isChangesLoading).toBe(false)

      await act(async () => {
        resolveCorrect!('Stale correction')
        await pending
      })

      expect(useAppStore.getState().outputText).toBe('')
      expect(correctionResultCache.set).not.toHaveBeenCalled()
      expect(grammar.extractChanges).not.toHaveBeenCalled()
      expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
      expect(useAppStore.getState().isLoading).toBe(false)
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )

  it.each(storeChanges)(
    'does not report an error from a correction retired by %s',
    async (_label, mutate) => {
      let rejectCorrect: (reason: unknown) => void
      grammar.correctText.mockReturnValue(new Promise((_resolve, reject) => { rejectCorrect = reject }))

      const { result } = renderHook(() => useCorrection())

      let pending!: Promise<string | undefined>
      act(() => {
        pending = result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        mutate()
      })

      await act(async () => {
        rejectCorrect!(new Error('Server error'))
        await pending
      })

      expect(useAppStore.getState().error).toBeNull()
      expect(useAppStore.getState().outputText).toBe('')
    }
  )

  it('retires a resumed correction stream when the input changes', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.detectSourceLanguage.mockReturnValue('fr')

    let releaseStream: () => void
    const gate = new Promise<void>(resolve => { releaseStream = resolve })

    async function* gatedStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }
    grammar.correctTextStream.mockReturnValue(gatedStream())

    const { result } = renderHook(() => useCorrection())

    let pending!: Promise<string | undefined>
    await act(async () => {
      pending = result.current.correct()
    })
    expect(useAppStore.getState().outputText).toBe('first-a')

    act(() => {
      useAppStore.getState().setInputText('Later text')
    })

    await act(async () => {
      releaseStream!()
      await pending
    })

    expect(useAppStore.getState().outputText).toBe('first-a')
    expect(correctionResultCache.set).not.toHaveBeenCalled()
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('retires a resumed correction stream when the streaming setting changes', async () => {
    useSettingsStore.setState({ useStreaming: true })
    grammar.detectSourceLanguage.mockReturnValue('fr')

    let releaseStream: () => void
    const gate = new Promise<void>(resolve => { releaseStream = resolve })

    async function* gatedStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }
    grammar.correctTextStream.mockReturnValue(gatedStream())

    const { result } = renderHook(() => useCorrection())

    let pending!: Promise<string | undefined>
    await act(async () => {
      pending = result.current.correct()
    })
    expect(useAppStore.getState().outputText).toBe('first-a')

    act(() => {
      useSettingsStore.setState({ useStreaming: false })
    })

    expect(grammar.correctTextStream.mock.calls[0][3].aborted).toBe(true)
    expect(useAppStore.getState().isLoading).toBe(false)

    await act(async () => {
      releaseStream!()
      await pending
    })

    expect(useAppStore.getState().outputText).toBe('first-a')
    expect(correctionResultCache.set).not.toHaveBeenCalled()
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
    expect(grammar.extractChanges).not.toHaveBeenCalled()
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('lets a correction started after a streaming toggle publish its own result', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    grammar.correctTextStream.mockReturnValue(streamOf('Hello', 'Hello world'))

    const { result } = renderHook(() => useCorrection())

    act(() => {
      useSettingsStore.setState({ useStreaming: true })
    })

    await act(async () => {
      await result.current.correct()
    })

    expect(grammar.correctText).not.toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('retires a background extraction when the input changes', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    grammar.correctText.mockResolvedValue('First corrected')
    const extractionResolvers: ((changes: unknown[]) => void)[] = []
    grammar.extractChanges.mockImplementation(
      () => new Promise(resolve => { extractionResolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('first text')
    })
    await waitFor(() => expect(extractionResolvers.length).toBe(1))
    expect(useAppStore.getState().isChangesLoading).toBe(true)

    act(() => {
      useAppStore.getState().setInputText('Later text')
    })

    expect(grammar.extractChanges.mock.calls[0][4].aborted).toBe(true)

    await act(async () => {
      extractionResolvers[0]([{ from: 'stale', to: 'stale', reason: 'stale' }])
    })

    expect(useAppStore.getState().changes).toEqual([])
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('leaves the correction alone when only the detected state changes', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')
    let resolveCorrect: (value: string) => void
    grammar.correctText.mockReturnValue(new Promise(resolve => { resolveCorrect = resolve }))

    const { result } = renderHook(() => useCorrection())

    let pending!: Promise<string | undefined>
    act(() => {
      pending = result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      useAppStore.getState().setLatestDetectedSourceLang('ja')
    })

    expect(grammar.correctText.mock.calls[0][3].aborted).toBe(false)

    await act(async () => {
      resolveCorrect!('Hello world')
      await pending
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('clears a detected language that a direct input mutation invalidates', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')

    act(() => {
      useAppStore.setState({ inputText: 'Later text' })
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
  })

  it('stops listening to the store after unmount', async () => {
    grammar.detectSourceLanguage.mockReturnValue('fr')

    const { result, unmount } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    unmount()

    act(() => {
      useAppStore.getState().setInputText('Later text')
    })

    expect(useAppStore.getState().inputText).toBe('Later text')
    expect(useAppStore.getState().isLoading).toBe(false)
  })
})
