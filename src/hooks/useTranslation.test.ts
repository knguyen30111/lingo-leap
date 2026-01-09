import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTranslation } from './useTranslation'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { translationCache } from '../lib/cache'
import { TranslationService } from '../services/translation-service'

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

vi.mock('../services/translation-service', () => {
  return {
    TranslationService: class MockTranslationService {
      translate = mockTranslate
      translateStream = mockTranslateStream
      detectSourceLanguage = mockDetectSourceLanguage
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
    expect(useAppStore.getState().sourceLang).toBe('fr')
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

    const translatePromise = act(async () => {
      result.current.translate()
    })

    await waitFor(() => {
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    await act(async () => {
      resolveTranslate!({ translated: 'Done' })
    })

    await translatePromise
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

    const translatePromise = act(async () => {
      result.current.translate()
    })

    await waitFor(() => {
      expect(useAppStore.getState().outputText).toBe('')
    })

    await act(async () => {
      resolveTranslate!({ translated: 'New output' })
    })

    await translatePromise
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
