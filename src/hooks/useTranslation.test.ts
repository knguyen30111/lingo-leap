/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTranslation } from './useTranslation'
import translationHookSource from './useTranslation.ts?raw'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { translationCache } from '../lib/cache'

// Mock dependencies
vi.mock('../lib/cache', () => ({
  translationCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
  createTranslationKey: vi.fn((text, src, tgt, model) => `${text}-${src}-${tgt}-${model}`),
}))

// Create a mock class for TranslationService
const mockTranslate = vi.fn()
const mockTranslateStream = vi.fn()
const mockDetectSourceLanguage = vi.fn()
const serviceConstructorOptions: Array<{ modelName: string; ollamaHost?: string }> = []

vi.mock('../services/translation-service', () => {
  return {
    TranslationService: class MockTranslationService {
      translate = mockTranslate
      translateStream = mockTranslateStream
      detectSourceLanguage = mockDetectSourceLanguage

      constructor(options: { modelName: string; ollamaHost?: string }) {
        serviceConstructorOptions.push(options)
      }
    },
  }
})

describe('useTranslation', () => {
  beforeEach(() => {
    // Reset mock functions
    mockTranslate.mockReset().mockResolvedValue({ translated: 'Xin chào thế giới' })
    mockTranslateStream.mockReset()
    mockDetectSourceLanguage.mockReset().mockReturnValue('en')

    // Reset stores
    useAppStore.setState({
      inputText: 'Hello world',
      outputText: '',
      sourceLang: 'en',
      latestDetectedSourceLang: null,
      targetLang: 'vi',
      isLoading: false,
      error: null,
    })

    useSettingsStore.setState({
      translationModel: 'gemma3:4b',
      ollamaHost: 'http://localhost:11434',
      useStreaming: false,
    })

    // Reset cache mocks
    serviceConstructorOptions.length = 0
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns translate, translateText, and cancel functions', () => {
    const { result } = renderHook(() => useTranslation())

    expect(typeof result.current.translate).toBe('function')
    expect(typeof result.current.translateText).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })

  it('translates text with non-streaming mode', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(useAppStore.getState().outputText).toBe('Xin chào thế giới')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('translates text with streaming mode', async () => {
    useSettingsStore.setState({ useStreaming: true })

    async function* mockStream() {
      yield 'Xin'
      yield 'Xin chào'
      yield 'Xin chào thế giới'
    }
    mockTranslateStream.mockReturnValue(mockStream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(useAppStore.getState().outputText).toBe('Xin chào thế giới')
  })

  it('uses cached result when available', async () => {
    vi.mocked(translationCache.get).mockReturnValue('Cached translation')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      const res = await result.current.translate()
      expect(res).toBe('Cached translation')
    })

    expect(mockTranslate).not.toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Cached translation')
  })

  it('skips cache when skipCache option is true', async () => {
    vi.mocked(translationCache.get).mockReturnValue('Cached translation')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate(undefined, { skipCache: true })
    })

    expect(mockTranslate).toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Xin chào thế giới')
  })

  it('does nothing for empty input', async () => {
    useAppStore.setState({ inputText: '' })

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only input', async () => {
    useAppStore.setState({ inputText: '   ' })

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('handles error during translation', async () => {
    mockTranslate.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useTranslation())

    await expect(act(async () => {
      await result.current.translate()
    })).rejects.toThrow('Network error')

    expect(useAppStore.getState().error).toBe('Network error')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    mockTranslate.mockRejectedValue('string error')

    const { result } = renderHook(() => useTranslation())

    await expect(act(async () => {
      await result.current.translate()
    })).rejects.toBe('string error')

    expect(useAppStore.getState().error).toBe('Translation failed')
  })

  it('caches result after translation', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(translationCache.set).toHaveBeenCalled()
  })

  it('cancel stops ongoing translation', async () => {
    // Create a translation that won't resolve immediately
    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve
      })
    )

    const { result } = renderHook(() => useTranslation())

    // Start translation (don't await)
    act(() => {
      result.current.translate()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    // Cancel the ongoing translation
    act(() => {
      result.current.cancel()
    })

    expect(useAppStore.getState().isLoading).toBe(false)

    // Clean up - resolve the promise to avoid warning
    resolveTranslate!({ translated: 'Cancelled' })
  })

  it('translates with custom text parameter', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate('Custom text')
    })

    expect(mockTranslate).toHaveBeenCalled()
  })

  it('translateText sets input and translates', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translateText('New input text')
    })

    expect(useAppStore.getState().inputText).toBe('New input text')
    expect(mockTranslate).toHaveBeenCalled()
  })

  it('auto-detects source language when set to auto', async () => {
    useAppStore.setState({ sourceLang: 'auto' })
    mockDetectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockDetectSourceLanguage).toHaveBeenCalled()
    expect(useAppStore.getState().sourceLang).toBe('auto')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('does not detect when source language is specified', async () => {
    useAppStore.setState({ sourceLang: 'en' })

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
  })

  it('sets loading state during translation', async () => {
    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve
      })
    )

    const { result } = renderHook(() => useTranslation())

    let translatePromise!: Promise<string | undefined>
    act(() => {
      translatePromise = result.current.translate()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    await act(async () => {
      resolveTranslate!({ translated: 'Done' })
      await translatePromise
    })
  })

  it('clears output before translating', async () => {
    useAppStore.setState({ outputText: 'Previous output' })

    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(
      new Promise((resolve) => {
        resolveTranslate = resolve
      })
    )

    const { result } = renderHook(() => useTranslation())

    let translatePromise!: Promise<string | undefined>
    act(() => {
      translatePromise = result.current.translate()
    })

    await waitFor(() => {
      expect(useAppStore.getState().outputText).toBe('')
    })

    await act(async () => {
      resolveTranslate!({ translated: 'New output' })
      await translatePromise
    })
  })

  it('returns translated result', async () => {
    const { result } = renderHook(() => useTranslation())

    let translatedResult: string | undefined
    await act(async () => {
      translatedResult = await result.current.translate()
    })

    expect(translatedResult).toBe('Xin chào thế giới')
  })
})

describe('useTranslation cancellation and races', () => {
  beforeEach(() => {
    mockTranslate.mockReset().mockResolvedValue({ translated: 'Xin chào thế giới' })
    mockTranslateStream.mockReset()
    mockDetectSourceLanguage.mockReset().mockReturnValue('en')

    useAppStore.setState({
      inputText: 'Hello world',
      outputText: '',
      sourceLang: 'en',
      latestDetectedSourceLang: null,
      targetLang: 'vi',
      isLoading: false,
      error: null,
    })
    useSettingsStore.setState({
      translationModel: 'gemma3:4b',
      ollamaHost: 'http://localhost:11434',
      useStreaming: false,
    })
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards a request signal to the translation service', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslate.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
    expect((mockTranslate.mock.calls[0][3] as AbortSignal).aborted).toBe(false)
  })

  it('forwards a request signal to the streaming service call', async () => {
    useSettingsStore.setState({ useStreaming: true })
    async function* stream() {
      yield 'Xin chào'
    }
    mockTranslateStream.mockReturnValue(stream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslateStream.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
  })

  it('does not publish or cache a cancelled translation', async () => {
    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(new Promise(resolve => { resolveTranslate = resolve }))

    const { result } = renderHook(() => useTranslation())

    act(() => {
      result.current.translate()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      resolveTranslate!({ translated: 'Late result' })
    })

    expect(useAppStore.getState().outputText).toBe('')
    expect(translationCache.set).not.toHaveBeenCalled()
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('lets only the newest overlapping request publish and cache', async () => {
    const resolvers: ((value: { translated: string }) => void)[] = []
    mockTranslate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useTranslation())

    act(() => {
      result.current.translate('first')
    })
    act(() => {
      result.current.translate('second')
    })

    await act(async () => {
      resolvers[1]({ translated: 'SECOND' })
    })
    await act(async () => {
      resolvers[0]({ translated: 'FIRST' })
    })

    expect(useAppStore.getState().outputText).toBe('SECOND')
    expect(translationCache.set).toHaveBeenCalledTimes(1)
    expect(translationCache.set).toHaveBeenCalledWith(expect.stringContaining('second'), 'SECOND')
  })

  it('keeps the newer request loading when an older one completes', async () => {
    const resolvers: ((value: { translated: string }) => void)[] = []
    mockTranslate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useTranslation())

    act(() => {
      result.current.translate('first')
    })
    act(() => {
      result.current.translate('second')
    })

    await act(async () => {
      resolvers[0]({ translated: 'FIRST' })
    })

    expect(useAppStore.getState().isLoading).toBe(true)
    expect(useAppStore.getState().outputText).toBe('')
  })

  it('ignores stream chunks from a superseded request', async () => {
    useSettingsStore.setState({ useStreaming: true })

    let releaseFirst: () => void
    const gate = new Promise<void>(resolve => { releaseFirst = resolve })

    async function* firstStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }
    async function* secondStream() {
      yield 'second'
    }
    mockTranslateStream.mockReturnValueOnce(firstStream()).mockReturnValueOnce(secondStream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      result.current.translate('first')
    })
    expect(useAppStore.getState().outputText).toBe('first-a')

    await act(async () => {
      await result.current.translate('second')
    })
    expect(useAppStore.getState().outputText).toBe('second')

    await act(async () => {
      releaseFirst!()
    })

    expect(useAppStore.getState().outputText).toBe('second')
    expect(translationCache.set).toHaveBeenCalledTimes(1)
    expect(translationCache.set).toHaveBeenCalledWith(expect.any(String), 'second')
  })

  it('does not report an error for a request cancelled by unmount', async () => {
    let rejectTranslate: (reason: unknown) => void
    mockTranslate.mockReturnValue(new Promise((_resolve, reject) => { rejectTranslate = reject }))

    const { result, unmount } = renderHook(() => useTranslation())

    act(() => {
      result.current.translate()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    unmount()

    await act(async () => {
      rejectTranslate!(new Error('Network error'))
    })

    expect(useAppStore.getState().error).toBeNull()
  })
})

describe('useTranslation service composition', () => {
  beforeEach(() => {
    mockTranslate.mockReset().mockResolvedValue({ translated: 'Xin chào thế giới' })
    mockTranslateStream.mockReset()
    mockDetectSourceLanguage.mockReset().mockReturnValue('en')

    useAppStore.setState({
      inputText: 'Hello world',
      outputText: '',
      sourceLang: 'en',
      latestDetectedSourceLang: null,
      targetLang: 'vi',
      isLoading: false,
      error: null,
    })
    useSettingsStore.setState({
      translationModel: 'gemma3:4b',
      ollamaHost: 'http://localhost:11434',
      useStreaming: false,
    })

    serviceConstructorOptions.length = 0
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('builds the translation service from the configured model and host', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(serviceConstructorOptions).toEqual([
      { modelName: 'gemma3:4b', ollamaHost: 'http://localhost:11434' },
    ])
  })

  it('runs the non-streaming translation through the injected task service', async () => {
    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslate.mock.calls[0].slice(0, 3)).toEqual(['Hello world', 'en', 'vi'])
    expect(mockTranslateStream).not.toHaveBeenCalled()
  })

  it('runs the streaming translation through the injected task service', async () => {
    useSettingsStore.setState({ useStreaming: true })
    async function* stream() {
      yield 'Xin'
      yield 'Xin chào'
    }
    mockTranslateStream.mockReturnValue(stream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslateStream.mock.calls[0].slice(0, 3)).toEqual(['Hello world', 'en', 'vi'])
    expect(mockTranslate).not.toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Xin chào')
  })

  it('keys the cache and the detected state on the language the service detected', async () => {
    useAppStore.setState({ sourceLang: 'auto' })
    mockDetectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(useAppStore.getState().sourceLang).toBe('auto')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
    expect(translationCache.get).toHaveBeenCalledWith('Hello world-fr-vi-gemma3:4b')
    expect(translationCache.set).toHaveBeenCalledWith(
      'Hello world-fr-vi-gemma3:4b',
      'Xin chào thế giới'
    )
    expect(mockTranslate.mock.calls[0][1]).toBe('fr')
  })

  it('keeps transport and prompt code out of the hook', () => {
    const forbidden = [
      /OllamaClient/,
      /lib\/prompts/,
      /getTranslationPrompt/,
      /buildTranslationPrompt/,
      /detectLanguage/,
      /cleanModelOutput/,
    ]

    const violations = forbidden.filter(pattern => pattern.test(translationHookSource))

    expect(violations).toEqual([])
  })
})

function resetTranslationEnvironment() {
  mockTranslate.mockReset().mockResolvedValue({ translated: 'Xin chào thế giới' })
  mockTranslateStream.mockReset()
  mockDetectSourceLanguage.mockReset().mockReturnValue('en')

  useAppStore.setState({
    mode: 'translate',
    inputText: 'Hello world',
    outputText: '',
    sourceLang: 'auto',
    latestDetectedSourceLang: null,
    targetLang: 'vi',
    isLoading: false,
    error: null,
  })
  useSettingsStore.setState({
    translationModel: 'gemma3:4b',
    ollamaHost: 'http://localhost:11434',
    useStreaming: false,
  })

  serviceConstructorOptions.length = 0
  vi.mocked(translationCache.get).mockReset()
  vi.mocked(translationCache.set).mockReset()
}

describe('useTranslation automatic source language', () => {
  beforeEach(resetTranslationEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps auto selected and reports the detected language separately', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(useAppStore.getState().sourceLang).toBe('auto')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('detects each new input instead of reusing the first detected language', async () => {
    mockDetectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate('Bonjour')
    })
    await act(async () => {
      await result.current.translate('こんにちは')
    })

    expect(mockDetectSourceLanguage.mock.calls.map(call => call[0])).toEqual([
      'Bonjour',
      'こんにちは',
    ])
    expect(mockTranslate.mock.calls[0][1]).toBe('fr')
    expect(mockTranslate.mock.calls[1][1]).toBe('ja')
    expect(translationCache.set).toHaveBeenCalledWith(
      'Bonjour-fr-vi-gemma3:4b',
      'Xin chào thế giới'
    )
    expect(translationCache.set).toHaveBeenCalledWith(
      'こんにちは-ja-vi-gemma3:4b',
      'Xin chào thế giới'
    )
    expect(useAppStore.getState().sourceLang).toBe('auto')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
  })

  it('reports the detected language of a cached automatic translation', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')
    vi.mocked(translationCache.get).mockReturnValue('Cached translation')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(translationCache.get).toHaveBeenCalledWith('Hello world-fr-vi-gemma3:4b')
    expect(useAppStore.getState().outputText).toBe('Cached translation')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
    expect(useAppStore.getState().sourceLang).toBe('auto')
  })

  it('reports the detected language of a streamed automatic translation', async () => {
    useSettingsStore.setState({ useStreaming: true })
    mockDetectSourceLanguage.mockReturnValue('fr')
    async function* stream() {
      yield 'Xin'
      yield 'Xin chào'
    }
    mockTranslateStream.mockReturnValue(stream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslateStream.mock.calls[0][1]).toBe('fr')
    expect(useAppStore.getState().outputText).toBe('Xin chào')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
    expect(useAppStore.getState().sourceLang).toBe('auto')
  })

  it('never overwrites a manual source selection with a detected language', async () => {
    useAppStore.setState({ sourceLang: 'en', latestDetectedSourceLang: 'fr' })
    mockDetectSourceLanguage.mockReturnValue('de')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockDetectSourceLanguage).not.toHaveBeenCalled()
    expect(mockTranslate.mock.calls[0][1]).toBe('en')
    expect(translationCache.get).toHaveBeenCalledWith('Hello world-en-vi-gemma3:4b')
    expect(useAppStore.getState().sourceLang).toBe('en')
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
  })

  it('keeps a manual cached translation from reviving a stale detected language', async () => {
    useAppStore.setState({ sourceLang: 'en', latestDetectedSourceLang: 'fr' })
    mockDetectSourceLanguage.mockReturnValue('de')
    vi.mocked(translationCache.get).mockReturnValue('Cached translation')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(useAppStore.getState().outputText).toBe('Cached translation')
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
  })

  it('keeps a manual streamed translation from reviving a stale detected language', async () => {
    useSettingsStore.setState({ useStreaming: true })
    useAppStore.setState({ sourceLang: 'en', latestDetectedSourceLang: 'fr' })
    mockDetectSourceLanguage.mockReturnValue('de')
    async function* stream() {
      yield 'Xin chào'
    }
    mockTranslateStream.mockReturnValue(stream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    expect(mockTranslateStream.mock.calls[0][1]).toBe('en')
    expect(useAppStore.getState().outputText).toBe('Xin chào')
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
  })

  it('does not report a detected language for a cancelled translation', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')
    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(new Promise(resolve => { resolveTranslate = resolve }))

    const { result } = renderHook(() => useTranslation())

    let translatePromise!: Promise<string | undefined>
    act(() => {
      translatePromise = result.current.translate()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      resolveTranslate!({ translated: 'Late result' })
      await translatePromise
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('lets only the newest request report its detected language', async () => {
    mockDetectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')
    const resolvers: ((value: { translated: string }) => void)[] = []
    mockTranslate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useTranslation())

    let first!: Promise<string | undefined>
    let second!: Promise<string | undefined>
    act(() => {
      first = result.current.translate('Bonjour')
    })
    act(() => {
      second = result.current.translate('こんにちは')
    })

    await act(async () => {
      resolvers[1]({ translated: 'SECOND' })
      await second
    })
    await act(async () => {
      resolvers[0]({ translated: 'FIRST' })
      await first
    })

    expect(useAppStore.getState().outputText).toBe('SECOND')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
  })

  it('ignores a resumed stream chunk from a superseded detection', async () => {
    useSettingsStore.setState({ useStreaming: true })
    mockDetectSourceLanguage.mockReturnValueOnce('fr').mockReturnValueOnce('ja')

    let releaseFirst: () => void
    const gate = new Promise<void>(resolve => { releaseFirst = resolve })

    async function* firstStream() {
      yield 'first-a'
      await gate
      yield 'first-b'
    }
    async function* secondStream() {
      yield 'second'
    }
    mockTranslateStream.mockReturnValueOnce(firstStream()).mockReturnValueOnce(secondStream())

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      result.current.translate('Bonjour')
    })
    await act(async () => {
      await result.current.translate('こんにちは')
    })

    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')

    await act(async () => {
      releaseFirst!()
    })

    expect(useAppStore.getState().outputText).toBe('second')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('ja')
    expect(translationCache.set).toHaveBeenCalledTimes(1)
  })
})

describe('useTranslation request retirement', () => {
  beforeEach(resetTranslationEnvironment)
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('publishes an explicit text that differs from the stored input', async () => {
    useAppStore.setState({ inputText: 'Stored input' })
    mockDetectSourceLanguage.mockReturnValue('fr')

    const { result } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate('Custom text')
    })

    expect(mockDetectSourceLanguage).toHaveBeenCalledWith('Custom text')
    expect(mockTranslate.mock.calls[0][0]).toBe('Custom text')
    expect(translationCache.get).toHaveBeenCalledWith('Custom text-fr-vi-gemma3:4b')
    expect(translationCache.set).toHaveBeenCalledWith(
      'Custom text-fr-vi-gemma3:4b',
      'Xin chào thế giới'
    )
    expect(useAppStore.getState().outputText).toBe('Xin chào thế giới')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  it('retires the older request while translateText stores its own input', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')
    const resolvers: ((value: { translated: string }) => void)[] = []
    mockTranslate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useTranslation())

    let older!: Promise<string | undefined>
    act(() => {
      older = result.current.translate('Old input')
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    let newer!: Promise<string | undefined>
    await act(async () => {
      newer = result.current.translateText('Custom text')
    })

    expect(useAppStore.getState().inputText).toBe('Custom text')
    expect(mockTranslate.mock.calls[0][3].aborted).toBe(true)
    expect(mockTranslate.mock.calls[1][3].aborted).toBe(false)
    expect(useAppStore.getState().isLoading).toBe(true)

    await act(async () => {
      resolvers[0]({ translated: 'OLD' })
      await older
    })

    expect(useAppStore.getState().outputText).toBe('')

    await act(async () => {
      resolvers[1]({ translated: 'NEW' })
      await newer
    })

    expect(useAppStore.getState().outputText).toBe('NEW')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(translationCache.set).toHaveBeenCalledTimes(1)
    expect(translationCache.set).toHaveBeenCalledWith('Custom text-fr-vi-gemma3:4b', 'NEW')
  })

  it('retires a translateText request once the input changes again', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')
    const resolvers: ((value: { translated: string }) => void)[] = []
    mockTranslate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useTranslation())

    let pending!: Promise<string | undefined>
    await act(async () => {
      pending = result.current.translateText('Custom text')
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      useAppStore.getState().setInputText('Later text')
    })

    expect(mockTranslate.mock.calls[0][3].aborted).toBe(true)
    expect(useAppStore.getState().isLoading).toBe(false)

    await act(async () => {
      resolvers[0]({ translated: 'STALE' })
      await pending
    })

    expect(useAppStore.getState().outputText).toBe('')
    expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
    expect(translationCache.set).not.toHaveBeenCalled()
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  const storeChanges = [
    ['the input text', () => useAppStore.getState().setInputText('Later text')],
    ['the selected source language', () => useAppStore.getState().setSourceLang('de')],
    ['the target language', () => useAppStore.getState().setTargetLang('ko')],
    ['the mode', () => useAppStore.getState().setMode('correct')],
  ] as const

  it.each(storeChanges)(
    'aborts and retires an in-flight translation when %s changes',
    async (_label, mutate) => {
      mockDetectSourceLanguage.mockReturnValue('fr')
      let resolveTranslate: (value: { translated: string }) => void
      mockTranslate.mockReturnValue(new Promise(resolve => { resolveTranslate = resolve }))

      const { result } = renderHook(() => useTranslation())

      let pending!: Promise<string | undefined>
      act(() => {
        pending = result.current.translate()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        mutate()
      })

      expect(mockTranslate.mock.calls[0][3].aborted).toBe(true)
      expect(useAppStore.getState().isLoading).toBe(false)

      await act(async () => {
        resolveTranslate!({ translated: 'Stale translation' })
        await pending
      })

      expect(useAppStore.getState().outputText).toBe('')
      expect(translationCache.set).not.toHaveBeenCalled()
      expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
      expect(useAppStore.getState().isLoading).toBe(false)
    }
  )

  it.each(storeChanges)(
    'does not report an error from a translation retired by %s',
    async (_label, mutate) => {
      let rejectTranslate: (reason: unknown) => void
      mockTranslate.mockReturnValue(new Promise((_resolve, reject) => { rejectTranslate = reject }))

      const { result } = renderHook(() => useTranslation())

      let pending!: Promise<string | undefined>
      act(() => {
        pending = result.current.translate()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        mutate()
      })

      await act(async () => {
        rejectTranslate!(new Error('Server error'))
        await pending
      })

      expect(useAppStore.getState().error).toBeNull()
      expect(useAppStore.getState().outputText).toBe('')
    }
  )

  it('leaves the detected language alone when only the detected state changes', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')
    let resolveTranslate: (value: { translated: string }) => void
    mockTranslate.mockReturnValue(new Promise(resolve => { resolveTranslate = resolve }))

    const { result } = renderHook(() => useTranslation())

    let pending!: Promise<string | undefined>
    act(() => {
      pending = result.current.translate()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      useAppStore.getState().setLatestDetectedSourceLang('ja')
    })

    expect(mockTranslate.mock.calls[0][3].aborted).toBe(false)
    expect(useAppStore.getState().isLoading).toBe(true)

    await act(async () => {
      resolveTranslate!({ translated: 'Xin chào' })
      await pending
    })

    expect(useAppStore.getState().outputText).toBe('Xin chào')
    expect(useAppStore.getState().latestDetectedSourceLang).toBe('fr')
  })

  const settingsChanges = [
    ['the translation model', { translationModel: 'other-model:1b' }],
    ['the Ollama host', { ollamaHost: 'http://other-host:11434' }],
  ] as const

  it.each(settingsChanges)(
    'aborts and retires an in-flight translation when %s changes',
    async (_label, change) => {
      mockDetectSourceLanguage.mockReturnValue('fr')
      let resolveTranslate: (value: { translated: string }) => void
      mockTranslate.mockReturnValue(new Promise(resolve => { resolveTranslate = resolve }))

      const { result } = renderHook(() => useTranslation())

      let pending!: Promise<string | undefined>
      act(() => {
        pending = result.current.translate()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        useSettingsStore.setState(change)
      })

      expect(mockTranslate.mock.calls[0][3].aborted).toBe(true)

      await act(async () => {
        resolveTranslate!({ translated: 'Stale translation' })
        await pending
      })

      expect(useAppStore.getState().outputText).toBe('')
      expect(translationCache.set).not.toHaveBeenCalled()
      expect(useAppStore.getState().latestDetectedSourceLang).toBeNull()
      expect(useAppStore.getState().isLoading).toBe(false)
    }
  )

  it('stops listening to the store after unmount', async () => {
    mockDetectSourceLanguage.mockReturnValue('fr')

    const { result, unmount } = renderHook(() => useTranslation())

    await act(async () => {
      await result.current.translate()
    })

    unmount()

    act(() => {
      useAppStore.getState().setTargetLang('ko')
    })

    expect(useAppStore.getState().targetLang).toBe('ko')
    expect(useAppStore.getState().isLoading).toBe(false)
  })
})
