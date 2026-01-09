import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Set up location.protocol BEFORE any imports that use it
// This needs to happen at module load time
Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: { protocol: 'tauri:', hostname: 'localhost' },
})

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

// Mock useWindowVisibility
vi.mock('./useWindowVisibility', () => ({
  useWindowVisibility: () => ({ isVisible: true }),
}))

// Import hook after mocks are set up
import { useSpeechToText } from './useSpeechToText'

// Global mock recognition instance for test access
let mockRecognitionInstance: MockSpeechRecognitionClass | null = null

// Mock SpeechRecognition as a class
class MockSpeechRecognitionClass {
  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn(() => {
    this.onstart?.()
  })
  stop = vi.fn(() => {
    this.onend?.()
  })
  abort = vi.fn()

  constructor() {
    mockRecognitionInstance = this
  }
}

describe('useSpeechToText', () => {
  // Helper to get the current mock recognition
  const getMockRecognition = () => mockRecognitionInstance!

  beforeEach(() => {
    mockRecognitionInstance = null

    // Reset location to tauri protocol (in case test changed it)
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'tauri:', hostname: 'localhost' },
    })

    // Set up window.webkitSpeechRecognition as a class constructor
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognitionClass,
    })

    // Mock permissions API
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    })

    // Mock AudioContext
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: vi.fn(() => ({
        state: 'running',
        resume: vi.fn().mockResolvedValue(undefined),
        sampleRate: 44100,
        createBuffer: vi.fn(() => ({})),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
        })),
        destination: {},
      })),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns isSupported based on API availability', async () => {
    const { result } = renderHook(() => useSpeechToText())
    expect(result.current.isSupported).toBe(true)
  })

  it('returns isSupported true when API available (module level)', () => {
    // API availability is checked at module load time
    // Since webkitSpeechRecognition is defined, isSupported should be true
    const { result } = renderHook(() => useSpeechToText())
    expect(result.current.isSupported).toBe(true)
  })

  it('returns initial state', async () => {
    const { result } = renderHook(() => useSpeechToText())

    expect(result.current.isListening).toBe(false)
    expect(result.current.transcript).toBe('')
    expect(result.current.interimTranscript).toBe('')
    expect(result.current.silenceDetected).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('starts listening', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().start).toHaveBeenCalled()
    expect(result.current.isListening).toBe(true)
  })

  it('stops listening', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      result.current.stopListening()
    })

    expect(getMockRecognition().stop).toHaveBeenCalled()
  })

  it('toggles listening', async () => {
    const { result } = renderHook(() => useSpeechToText())

    // Start
    await act(async () => {
      await result.current.toggleListening()
    })
    expect(result.current.isListening).toBe(true)

    // Stop
    await act(async () => {
      await result.current.toggleListening()
    })
    expect(getMockRecognition().stop).toHaveBeenCalled()
  })

  it('clears transcript', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      result.current.clearTranscript()
    })

    expect(result.current.transcript).toBe('')
    expect(result.current.interimTranscript).toBe('')
  })

  it('handles speech recognition error', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onerror?.({ error: 'not-allowed', message: '' })
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(onError).toHaveBeenCalled()
  })

  it('ignores aborted errors', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onerror?.({ error: 'aborted', message: '' })
    })

    expect(result.current.error).toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  it('ignores no-speech errors in continuous mode', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onerror?.({ error: 'no-speech', message: '' })
    })

    expect(result.current.error).toBeNull()
  })

  it('calls onTextReady with final text', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            length: 1,
            0: { transcript: 'Hello world' },
          },
        },
      })
    })

    expect(onTextReady).toHaveBeenCalledWith('Hello world')
  })

  it('updates interim transcript', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: false,
            length: 1,
            0: { transcript: 'Hello wor' },
          },
        },
      })
    })

    expect(result.current.interimTranscript).toBe('Hello wor')
  })

  it('calls onEnd when recognition ends', async () => {
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onEnd }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onend?.()
    })

    // onEnd is called when not manually stopping
    expect(onEnd).toHaveBeenCalled()
  })

  it('sets correct language code', async () => {
    const { result } = renderHook(() => useSpeechToText({ lang: 'vi' }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().lang).toBe('vi-VN')
  })

  it('defaults to en-US for auto language', async () => {
    const { result } = renderHook(() => useSpeechToText({ lang: 'auto' }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().lang).toBe('en-US')
  })

  it('handles microphone permission denied', async () => {
    const onError = vi.fn()
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
    })

    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(onError).toHaveBeenCalled()
  })

  it('does not start when already listening', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    getMockRecognition().start.mockClear()

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().start).not.toHaveBeenCalled()
  })

  it('handles start error', async () => {
    // Create a mock class that throws on start
    class ErrorMockSpeechRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onstart: (() => void) | null = null
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      start = vi.fn(() => { throw new Error('Start failed') })
      stop = vi.fn()
      abort = vi.fn()
    }

    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: ErrorMockSpeechRecognition,
    })

    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Start failed')
    expect(onError).toHaveBeenCalled()
  })

  it('disables in dev mode', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'http:' },
    })

    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')
  })

  it('handles other speech errors', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      getMockRecognition().onerror?.({ error: 'network', message: 'Network error' })
    })

    expect(result.current.error).toBe('Speech error: network')
    expect(onError).toHaveBeenCalled()
  })

  it('handles permissions query failure', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockRejectedValue(new Error('Not supported')),
      },
    })

    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    // Should still try to start (fallback behavior)
    expect(getMockRecognition().start).toHaveBeenCalled()
  })

  it('handles missing permissions API', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    // Should still try to start
    expect(getMockRecognition().start).toHaveBeenCalled()
  })

  it('handles prompt permission state', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
    })

    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().start).toHaveBeenCalled()
  })

  it('sends interim text on end if available', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })

    // First send interim transcript
    act(() => {
      getMockRecognition().onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: false,
            length: 1,
            0: { transcript: 'Pending text' },
          },
        },
      })
    })

    // Then end recognition
    act(() => {
      getMockRecognition().onend?.()
    })

    // interimTranscript should have been cleared or sent
    expect(result.current.isListening).toBe(false)
  })

  it('uses fallback language code for unknown language', async () => {
    const { result } = renderHook(() => useSpeechToText({ lang: 'unknown' }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(getMockRecognition().lang).toBe('en-US')
  })

  describe('Audio context handling', () => {
    it('handles suspended audio context', async () => {
      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: vi.fn(() => ({
          state: 'suspended',
          resume: vi.fn().mockResolvedValue(undefined),
          sampleRate: 44100,
          createBuffer: vi.fn(() => ({})),
          createBufferSource: vi.fn(() => ({
            buffer: null,
            connect: vi.fn(),
            start: vi.fn(),
          })),
          destination: {},
        })),
      })

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startListening()
      })

      act(() => {
        result.current.stopListening()
      })

      // Should not throw
      expect(result.current.isListening).toBe(false)
    })
  })

  describe('WebKit audio context fallback', () => {
    it('uses webkitAudioContext when AudioContext not available', async () => {
      const webkitMock = vi.fn(() => ({
        state: 'running',
        resume: vi.fn().mockResolvedValue(undefined),
        sampleRate: 44100,
        createBuffer: vi.fn(() => ({})),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
        })),
        destination: {},
      }))

      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: undefined,
      })

      Object.defineProperty(window, 'webkitAudioContext', {
        configurable: true,
        value: webkitMock,
      })

      const { result } = renderHook(() => useSpeechToText())

      await act(async () => {
        await result.current.startListening()
      })

      act(() => {
        result.current.stopListening()
      })

      expect(result.current.isListening).toBe(false)
    })
  })
})
