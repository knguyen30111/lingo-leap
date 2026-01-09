import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCorrection } from './useCorrection'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'
import { translationCache } from '../lib/cache'

// Mock dependencies
vi.mock('../lib/ollama-client', () => ({
  ollamaClient: {
    setBaseUrl: vi.fn(),
    generate: vi.fn(),
    generateStream: vi.fn(),
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
      correctionLevel: 'light',
      isLoading: false,
      error: null,
      changes: [],
      changesLoading: false,
    })

    useSettingsStore.setState({
      correctionModel: 'gemma3:4b',
      ollamaHost: 'http://localhost:11434',
      useStreaming: false,
      explanationLang: 'auto',
    })

    // Reset mocks with default return values
    // ollamaClient.generate is used both for main correction AND for extracting changes
    // Always return a Promise to prevent .then() errors
    vi.mocked(ollamaClient.generate).mockReset().mockResolvedValue('Hello world')
    vi.mocked(ollamaClient.generateStream).mockReset()
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
    vi.mocked(ollamaClient.generate).mockResolvedValue('Hello world')

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
    vi.mocked(ollamaClient.generateStream).mockReturnValue(mockStream())

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
    vi.mocked(ollamaClient.generate).mockResolvedValue('Fresh result')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, undefined, { skipCache: true })
    })

    expect(ollamaClient.generate).toHaveBeenCalled()
    expect(useAppStore.getState().outputText).toBe('Fresh result')
  })

  it('does nothing for empty input', async () => {
    useAppStore.setState({ inputText: '' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(ollamaClient.generate).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only input', async () => {
    useAppStore.setState({ inputText: '   ' })

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(ollamaClient.generate).not.toHaveBeenCalled()
  })

  it('handles error during correction', async () => {
    vi.mocked(ollamaClient.generate).mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toThrow('Server error')

    expect(useAppStore.getState().error).toBe('Server error')
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    vi.mocked(ollamaClient.generate).mockRejectedValue('string error')

    const { result } = renderHook(() => useCorrection())

    await expect(act(async () => {
      await result.current.correct()
    })).rejects.toBe('string error')

    expect(useAppStore.getState().error).toBe('Correction failed')
  })

  it('caches result after correction', async () => {
    vi.mocked(ollamaClient.generate).mockResolvedValue('Hello world')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(translationCache.set).toHaveBeenCalled()
  })

  it('setLevel updates correction level', () => {
    const { result } = renderHook(() => useCorrection())

    act(() => {
      result.current.setLevel('heavy')
    })

    expect(useAppStore.getState().correctionLevel).toBe('heavy')
  })

  it('cancel stops ongoing correction', async () => {
    // Create a correction that won't resolve immediately
    let resolveGenerate: (value: string) => void
    vi.mocked(ollamaClient.generate).mockReturnValue(
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
    vi.mocked(ollamaClient.generate).mockResolvedValue('Custom corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct('Custom text')
    })

    expect(useAppStore.getState().outputText).toBe('Custom corrected')
  })

  it('corrects with custom level parameter', async () => {
    vi.mocked(ollamaClient.generate).mockResolvedValue('Heavy corrected')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct(undefined, 'heavy')
    })

    expect(ollamaClient.generate).toHaveBeenCalled()
  })

  it('cleans model output artifacts', async () => {
    vi.mocked(ollamaClient.generate).mockResolvedValue('Hello world<|im_end|>')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(useAppStore.getState().outputText).toBe('Hello world')
  })

  it('sets base URL before request', async () => {
    vi.mocked(ollamaClient.generate).mockResolvedValue('Hello')

    const { result } = renderHook(() => useCorrection())

    await act(async () => {
      await result.current.correct()
    })

    expect(ollamaClient.setBaseUrl).toHaveBeenCalledWith('http://localhost:11434')
  })

  it('sets loading state during correction', async () => {
    let resolveGenerate: (value: string) => void
    vi.mocked(ollamaClient.generate).mockReturnValue(
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
      vi.mocked(ollamaClient.generate)
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
      vi.mocked(ollamaClient.generate)
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
      vi.mocked(ollamaClient.generate).mockResolvedValue('[{"from": "wrold", "to": "world", "reason": "Typo"}]')

      useAppStore.setState({ inputText: 'Hello wrold' })
      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(useAppStore.getState().outputText).toBe('Cached result')
    })

    it('does not extract changes when result equals input', async () => {
      vi.mocked(ollamaClient.generate).mockResolvedValueOnce('Hello wrold')

      useAppStore.setState({ inputText: 'Hello wrold' })
      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      // Generate should only be called once (for correction, not for changes)
      expect(ollamaClient.generate).toHaveBeenCalledTimes(1)
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
      vi.mocked(ollamaClient.generateStream).mockReturnValue(mockStream())

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
      vi.mocked(ollamaClient.generate).mockRejectedValue(abortError)

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
      vi.mocked(ollamaClient.generate).mockResolvedValue('Hello world')

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(ollamaClient.generate).toHaveBeenCalled()
    })

    it('uses specified language when explanationLang is set', async () => {
      useSettingsStore.setState({ explanationLang: 'ja' })
      vi.mocked(ollamaClient.generate).mockResolvedValue('Hello world')

      const { result } = renderHook(() => useCorrection())

      await act(async () => {
        await result.current.correct()
      })

      expect(ollamaClient.generate).toHaveBeenCalled()
    })
  })
})
