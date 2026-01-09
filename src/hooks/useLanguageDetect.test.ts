import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLanguageDetect } from './useLanguageDetect'
import { useAppStore } from '../stores/appStore'

// Mock language detection functions
vi.mock('../lib/language', () => ({
  detectLanguage: vi.fn((text: string) => {
    // Simple mock: detect Vietnamese if contains Vietnamese characters
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) {
      return 'vi'
    }
    return 'en'
  }),
  shouldUseCorrection: vi.fn((text: string, targetLang: string) => {
    // Mock: use correction if detected language matches target
    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)
    const detected = hasVietnamese ? 'vi' : 'en'
    return detected === targetLang
  }),
}))

describe('useLanguageDetect', () => {
  beforeEach(() => {
    // Reset store state
    useAppStore.setState({
      inputText: '',
      targetLang: 'vi',
      sourceLang: 'en',
      mode: 'translate',
    })
  })

  it('returns detect function', () => {
    const { result } = renderHook(() => useLanguageDetect())
    expect(typeof result.current.detect).toBe('function')
  })

  it('returns autoDetectAndSetMode function', () => {
    const { result } = renderHook(() => useLanguageDetect())
    expect(typeof result.current.autoDetectAndSetMode).toBe('function')
  })

  it('detect returns en for empty text', () => {
    const { result } = renderHook(() => useLanguageDetect())
    expect(result.current.detect('')).toBe('en')
    expect(result.current.detect('   ')).toBe('en')
  })

  it('detect identifies English text', () => {
    const { result } = renderHook(() => useLanguageDetect())
    expect(result.current.detect('Hello world')).toBe('en')
  })

  it('detect identifies Vietnamese text', () => {
    const { result } = renderHook(() => useLanguageDetect())
    expect(result.current.detect('Xin chào')).toBe('vi')
  })

  it('autoDetectAndSetMode sets source language', () => {
    const { result } = renderHook(() => useLanguageDetect())

    act(() => {
      result.current.autoDetectAndSetMode('Hello world')
    })

    expect(useAppStore.getState().sourceLang).toBe('en')
  })

  it('autoDetectAndSetMode sets mode to translate when languages differ', () => {
    useAppStore.setState({ targetLang: 'vi' })

    const { result } = renderHook(() => useLanguageDetect())

    act(() => {
      result.current.autoDetectAndSetMode('Hello world')
    })

    expect(useAppStore.getState().mode).toBe('translate')
  })

  it('autoDetectAndSetMode sets mode to correct when languages match', () => {
    useAppStore.setState({ targetLang: 'en' })

    const { result } = renderHook(() => useLanguageDetect())

    act(() => {
      result.current.autoDetectAndSetMode('Hello world')
    })

    expect(useAppStore.getState().mode).toBe('correct')
  })

  it('autoDetectAndSetMode returns detected language', () => {
    const { result } = renderHook(() => useLanguageDetect())

    let detected: string = ''
    act(() => {
      detected = result.current.autoDetectAndSetMode('Xin chào')
    })

    expect(detected).toBe('vi')
  })

  it('auto-detects when inputText changes', () => {
    const { rerender } = renderHook(() => useLanguageDetect())

    act(() => {
      useAppStore.setState({ inputText: 'Hello world' })
    })
    rerender()

    expect(useAppStore.getState().sourceLang).toBe('en')
  })

  it('does not auto-detect for empty input', () => {
    useAppStore.setState({ sourceLang: 'vi' }) // Set initial
    const { rerender } = renderHook(() => useLanguageDetect())

    act(() => {
      useAppStore.setState({ inputText: '' })
    })
    rerender()

    // Should keep previous value
    expect(useAppStore.getState().sourceLang).toBe('vi')
  })

  it('does not auto-detect for whitespace-only input', () => {
    useAppStore.setState({ sourceLang: 'vi' })
    const { rerender } = renderHook(() => useLanguageDetect())

    act(() => {
      useAppStore.setState({ inputText: '   ' })
    })
    rerender()

    expect(useAppStore.getState().sourceLang).toBe('vi')
  })

  it('updates mode based on target language', () => {
    useAppStore.setState({ targetLang: 'vi' })

    const { result } = renderHook(() => useLanguageDetect())

    // English text with Vietnamese target -> translate
    act(() => {
      result.current.autoDetectAndSetMode('Hello')
    })
    expect(useAppStore.getState().mode).toBe('translate')

    // Vietnamese text with Vietnamese target -> correct
    act(() => {
      result.current.autoDetectAndSetMode('Xin chào')
    })
    expect(useAppStore.getState().mode).toBe('correct')
  })

  it('detect function is stable across renders', () => {
    const { result, rerender } = renderHook(() => useLanguageDetect())
    const firstDetect = result.current.detect

    rerender()

    expect(result.current.detect).toBe(firstDetect)
  })
})
