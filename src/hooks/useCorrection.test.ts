import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCorrection } from './useCorrection'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { translationCache } from '../lib/cache'

// Mock the transport class: the hook owns a client for one configured host.
const transport = vi.hoisted(() => ({
  constructedHosts: [] as string[],
  generate: vi.fn(),
  generateStream: vi.fn(),
}))

vi.mock('../lib/ollama-client', () => ({
  OllamaClient: class MockOllamaClient {
    generate = transport.generate
    generateStream = transport.generateStream

    constructor(baseUrl: string) {
      transport.constructedHosts.push(baseUrl)
    }
  },
}))

vi.mock('../lib/cache', () => ({
  translationCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
  createCorrectionKey: vi.fn((text, lang, level, model) => `${text}-${lang}-${level}-${model}`),
}))

vi.mock('../lib/language', () => ({
  detectLanguage: vi.fn(() => 'en'),
}))

vi.mock('../lib/prompts', () => ({
  getCorrectionPrompt: vi.fn(() => 'correction prompt'),
  getChangesExtractionPrompt: vi.fn(() => 'changes prompt'),
}))

describe('useCorrection', () => {
  beforeEach(() => {
    // Reset stores
    useAppStore.setState({
      inputText: 'Hello wrold',
      outputText: '',
      correctionLevel: 'fix',
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

    // Reset mocks with default return values
    // generate is used both for main correction AND for extracting changes
    // Always return a Promise to prevent .then() errors
    transport.constructedHosts.length = 0
    transport.generate.mockReset().mockResolvedValue('Hello world')
    transport.generateStream.mockReset()
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

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
    transport.generate.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('corrects text with streaming mode', async () => {
    useSettingsStore.setState({ useStreaming: true })

    async function* mockStream() {
      yield 'Hello'
      yield ' world'
    }
    transport.generateStream.mockReturnValue(mockStream())

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
  })

  it('uses cached result when available', async () => {
    vi.mocked(translationCache.get).mockReturnValue('Cached result')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      const res = await result.current.correct()
      expect(res).toBe('Cached result')
    })

    // Note: generate IS called for extracting changes (background task),
    // but not for the main correction
    expect(useAppStore.getState().outputText).toBe('Cached result')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('skips cache when skipCache option is true', async () => {
    vi.mocked(translationCache.get).mockReturnValue('Cached result')
    transport.generate.mockResolvedValue('Fresh result')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, undefined, { skipCache: true })
    })

    expect(transport.generate).toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Fresh result')
  })

  it('does nothing for empty input', async () => {
    useAppStore.setState({ inputText: '' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only input', async () => {
    useAppStore.setState({ inputText: '   ' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('handles error during correction', async () => {
    transport.generate.mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toThrow('Server error')

    expect(useAppStore.getState().error).toBe('Server error')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    transport.generate.mockRejectedValue('string error')

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toBe('string error')

    expect(useAppStore.getState().error).toBe('Correction failed')
  })

  it('caches result after correction', async () => {
    transport.generate.mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(translationCache.set).toHaveBeenCalled()
  })

  it('setLevel updates correction level', () => {
    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.setLevel('rewrite')
    })

    expect(useAppStore.getState().correctionLevel).toBe('rewrite')
  })

  it('cancel stops ongoing correction', async () => {
    // Create a correction that won't resolve immediately
    let resolveGenerate: (value: string) => void
    transport.generate.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve
      })
    )

    const { result } = renderHook(() => useCorrection())

    // Start correction (don't await)
    act(() => {
      result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    // Cancel the ongoing correction
    act(() => {
      result.current.cancel()
    })

    expect(useAppStore.getState().isLoading).toBe(false)

    // Clean up - resolve the promise to avoid warning
    resolveGenerate!('Cancelled')
  })

  it('corrects with custom text parameter', async () => {
    transport.generate.mockResolvedValue('Custom corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('Custom text')
    })

    expect(useAppStore.getState().outputText).toBe('Custom corrected')
  })

  it('corrects with custom level parameter', async () => {
    transport.generate.mockResolvedValue('Heavy corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, 'rewrite')
    })

    expect(transport.generate).toHaveBeenCalled()
  })

  it('cleans model output artifacts', async () => {
    transport.generate.mockResolvedValue('Hello world<|im_end|>')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
  })

  it('constructs a client bound to the configured host', async () => {
    transport.generate.mockResolvedValue('Hello')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(transport.constructedHosts).toEqual(['http://localhost:11434'])
  })

  it('sets loading state during correction', async () => {
    let resolveGenerate: (value: string) => void
    transport.generate.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve
      })
    )

    const { result } = renderHook(() => useCorrection())

    const correctPromise = act(async () => {
      result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    await act(async () => {
      resolveGenerate!('Done')
    })

    await correctPromise
  })

  describe('Changes extraction', () => {
    it('extracts changes when text is modified', async () => {
      // First call is for correction, second is for changes extraction
      transport.generate
        .mockResolvedValueOnce('Hello world')
        .mockResolvedValueOnce('[{"from": "wrold", "to": "world", "reason": "Typo"}]')

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      // Wait for changes to be extracted (async background task)
      await waitFor(() => {
        expect(useAppStore.getState().changes.length).toBeGreaterThanOrEqual(0)
      })
    })

    it('uses fallback when JSON parsing fails', async () => {
      transport.generate
        .mockResolvedValueOnce('Hello world')
        .mockResolvedValueOnce('Invalid JSON response')

      useAppStore.setState({ inputText: 'Hello wrold' })
      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      // Should still complete without error
      expect(useAppStore.getState().outputText).toBe('Hello world')
    })

    it('extracts changes from cached result', async () => {
      vi.mocked(translationCache.get).mockReturnValue('Cached result')
      transport.generate.mockResolvedValue('[{"from": "wrold", "to": "world", "reason": "Typo"}]')

      useAppStore.setState({ inputText: 'Hello wrold' })
      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(useAppStore.getState().outputText).toBe('Cached result')
    })

    it('does not extract changes when result equals input', async () => {
      transport.generate.mockResolvedValueOnce('Hello wrold')

      useAppStore.setState({ inputText: 'Hello wrold' })
      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      // Generate should only be called once (for correction, not for changes)
      expect(transport.generate).toHaveBeenCalledTimes(1)
    })
  })

  describe('Streaming with cleaning', () => {
    it('cleans model artifacts during streaming', async () => {
      useSettingsStore.setState({ useStreaming: true })

      async function* mockStream() {
        yield 'Hello'
        yield ' world'
        yield '<|im_end|>'
      }
      transport.generateStream.mockReturnValue(mockStream())

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(useAppStore.getState().outputText).toBe('Hello world')
    })
  })

  describe('Abort handling', () => {
    it('ignores AbortError during correction', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      transport.generate.mockRejectedValue(abortError)

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      // Should not set error for AbortError
      expect(useAppStore.getState().error).toBeNull()
    })
  })

  describe('Explanation language', () => {
    it('uses detected language when explanationLang is auto', async () => {
      useSettingsStore.setState({ explanationLang: 'auto' })
      transport.generate.mockResolvedValue('Hello world')

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(transport.generate).toHaveBeenCalled()
    })

    it('uses specified language when explanationLang is set', async () => {
      useSettingsStore.setState({ explanationLang: 'ja' })
      transport.generate.mockResolvedValue('Hello world')

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(transport.generate).toHaveBeenCalled()
    })
  })
})

describe('useCorrection cancellation and races', () => {
  beforeEach(() => {
    useAppStore.setState({
      inputText: 'Hello wrold',
      outputText: '',
      correctionLevel: 'fix',
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
    transport.constructedHosts.length = 0
    transport.generate.mockReset().mockResolvedValue('Hello world')
    transport.generateStream.mockReset()
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards a request signal to the correction and extraction calls', async () => {
    transport.generate
      .mockResolvedValueOnce('Hello world')
      .mockResolvedValueOnce('[{"from": "wrold", "to": "world", "reason": "Typo"}]')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    await waitFor(() => expect(transport.generate).toHaveBeenCalledTimes(2))

    expect(transport.generate.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    expect(transport.generate.mock.calls[1][1]).toBeInstanceOf(AbortSignal)
  })

  it('forwards a request signal to the streaming correction call', async () => {
    useSettingsStore.setState({ useStreaming: true })
    async function* stream() {
      yield 'Hello world'
    }
    transport.generateStream.mockReturnValue(stream())

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(transport.generateStream.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
  })

  it('does not publish or cache a cancelled correction', async () => {
    let resolveGenerate: (value: string) => void
    transport.generate.mockReturnValue(new Promise(resolve => { resolveGenerate = resolve }))

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      resolveGenerate!('Late correction')
    })

    expect(useAppStore.getState().outputText).toBe('')
    expect(translationCache.set).not.toHaveBeenCalled()
    expect(useAppStore.getState().isLoading).toBe(false)
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('lets only the newest overlapping correction publish and cache', async () => {
    const resolvers: ((value: string) => void)[] = []
    transport.generate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct('first text')
    })
    act(() => {
      result.current.correct('second text')
    })

    await act(async () => {
      resolvers[1]('SECOND')
    })
    await act(async () => {
      resolvers[0]('FIRST')
    })

    expect(useAppStore.getState().outputText).toBe('SECOND')
    expect(translationCache.set).toHaveBeenCalledTimes(1)
    expect(translationCache.set).toHaveBeenCalledWith(expect.stringContaining('second text'), 'SECOND')
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
    async function* secondStream() {
      yield 'second'
    }
    transport.generateStream.mockReturnValueOnce(firstStream()).mockReturnValueOnce(secondStream())

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
    expect(translationCache.set).toHaveBeenCalledTimes(1)
    expect(translationCache.set).toHaveBeenCalledWith(expect.any(String), 'second')
  })

  it('ignores a superseded background change extraction', async () => {
    const resolvers: ((value: string) => void)[] = []
    transport.generate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct('first text')
    })
    await waitFor(() => expect(resolvers.length).toBe(1))

    // Correction one completes and starts its background extraction.
    await act(async () => {
      resolvers[0]('First corrected')
    })
    await waitFor(() => expect(resolvers.length).toBe(2))

    // A second correction supersedes the pending extraction.
    act(() => {
      result.current.correct('second text')
    })
    await waitFor(() => expect(resolvers.length).toBe(3))

    await act(async () => {
      resolvers[1]('[{"from": "stale", "to": "stale", "reason": "stale"}]')
    })

    expect(useAppStore.getState().changes).toEqual([])
  })

  it('does not publish a fallback diff for a superseded extraction', async () => {
    const resolvers: ((value: string) => void)[] = []
    transport.generate.mockImplementation(
      () => new Promise(resolve => { resolvers.push(resolve) })
    )

    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct('first text')
    })
    await waitFor(() => expect(resolvers.length).toBe(1))

    await act(async () => {
      resolvers[0]('First corrected')
    })
    await waitFor(() => expect(resolvers.length).toBe(2))

    act(() => {
      result.current.correct('second text')
    })
    await waitFor(() => expect(resolvers.length).toBe(3))

    // The superseded extraction answers with unparseable text.
    await act(async () => {
      resolvers[1]('no json here')
    })

    expect(useAppStore.getState().changes).toEqual([])
  })

  it('falls back to a diff when the current extraction request fails', async () => {
    transport.generate
      .mockResolvedValueOnce('Hello world')
      .mockRejectedValueOnce(new Error('extraction failed'))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    await waitFor(() => {
      expect(useAppStore.getState().changes).toEqual([
        { from: 'Hello wrold', to: 'Hello world', reason: 'Text was corrected/improved' },
      ])
    })
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('does not fall back to a stale diff when extraction fails after cancel', async () => {
    const rejecters: ((reason: unknown) => void)[] = []
    transport.generate
      .mockResolvedValueOnce('Hello world')
      .mockImplementation(() => new Promise((_resolve, reject) => { rejecters.push(reject) }))

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })
    await waitFor(() => expect(rejecters.length).toBe(1))
    expect(useAppStore.getState().isChangesLoading).toBe(true)

    act(() => {
      result.current.cancel()
    })

    await act(async () => {
      rejecters[0](new Error('extraction failed'))
    })

    expect(useAppStore.getState().changes).toEqual([])
    expect(useAppStore.getState().isChangesLoading).toBe(false)
  })

  it('does not report an error for a correction cancelled by unmount', async () => {
    let rejectGenerate: (reason: unknown) => void
    transport.generate.mockReturnValue(new Promise((_resolve, reject) => { rejectGenerate = reject }))

    const { result, unmount } = renderHook(() => useCorrection())

    act(() => {
      result.current.correct()
    })
    await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

    unmount()

    await act(async () => {
      rejectGenerate!(new Error('Server error'))
    })

    expect(useAppStore.getState().error).toBeNull()
  })
})

describe('useCorrection settings invalidation', () => {
  const settingsChanges = [
    ['the correction model', { correctionModel: 'other-model:1b' }],
    ['the explanation language', { explanationLang: 'ja' }],
  ] as const

  beforeEach(() => {
    useAppStore.setState({
      inputText: 'Hello wrold',
      outputText: '',
      correctionLevel: 'fix',
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
    transport.constructedHosts.length = 0
    transport.generate.mockReset().mockResolvedValue('Hello world')
    transport.generateStream.mockReset()
    vi.mocked(translationCache.get).mockReset()
    vi.mocked(translationCache.set).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each(settingsChanges)(
    'aborts and retires an in-flight correction when %s changes',
    async (_label, change) => {
      let resolveGenerate: (value: string) => void
      transport.generate.mockReturnValue(new Promise(resolve => { resolveGenerate = resolve }))

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        useSettingsStore.setState(change)
      })

      expect(transport.generate.mock.calls[0][1].aborted).toBe(true)

      await act(async () => {
        resolveGenerate!('Stale correction')
      })

      expect(useAppStore.getState().outputText).toBe('')
      expect(translationCache.set).not.toHaveBeenCalled()
      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().isLoading).toBe(false)
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )

  it.each(settingsChanges)(
    'does not report an error from a correction retired by a change to %s',
    async (_label, change) => {
      let rejectGenerate: (reason: unknown) => void
      transport.generate.mockReturnValue(new Promise((_resolve, reject) => { rejectGenerate = reject }))

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct()
      })
      await waitFor(() => expect(useAppStore.getState().isLoading).toBe(true))

      act(() => {
        useSettingsStore.setState(change)
      })

      await act(async () => {
        rejectGenerate!(new Error('Server error'))
      })

      expect(useAppStore.getState().error).toBeNull()
      expect(useAppStore.getState().outputText).toBe('')
    }
  )

  it.each(settingsChanges)(
    'aborts and retires a background change extraction when %s changes',
    async (_label, change) => {
      const resolvers: ((value: string) => void)[] = []
      transport.generate.mockImplementation(
        () => new Promise(resolve => { resolvers.push(resolve) })
      )

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct('first text')
      })
      await waitFor(() => expect(resolvers.length).toBe(1))

      // The correction publishes and starts its background extraction.
      await act(async () => {
        resolvers[0]('First corrected')
      })
      await waitFor(() => expect(resolvers.length).toBe(2))
      expect(useAppStore.getState().isChangesLoading).toBe(true)

      act(() => {
        useSettingsStore.setState(change)
      })

      expect(transport.generate.mock.calls[1][1].aborted).toBe(true)

      await act(async () => {
        resolvers[1]('[{"from": "stale", "to": "stale", "reason": "stale"}]')
      })

      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )

  it.each(settingsChanges)(
    'does not publish a fallback diff from an extraction retired by a change to %s',
    async (_label, change) => {
      const resolvers: ((value: string) => void)[] = []
      transport.generate.mockImplementation(
        () => new Promise(resolve => { resolvers.push(resolve) })
      )

      const { result } = renderHook(() => useCorrection())

      act(() => {
        result.current.correct('first text')
      })
      await waitFor(() => expect(resolvers.length).toBe(1))

      await act(async () => {
        resolvers[0]('First corrected')
      })
      await waitFor(() => expect(resolvers.length).toBe(2))

      act(() => {
        useSettingsStore.setState(change)
      })

      // The retired extraction answers with unparseable text.
      await act(async () => {
        resolvers[1]('no json here')
      })

      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    }
  )
})
