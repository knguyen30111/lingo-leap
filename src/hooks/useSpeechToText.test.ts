import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// Mock useWindowVisibility - the speech hook composes it and owns the cleanup
let mockIsVisible = true
vi.mock('./useWindowVisibility', () => ({
  useWindowVisibility: () => ({ isVisible: mockIsVisible }),
}))

// Import after mocks are set up
import { invoke } from '@tauri-apps/api/core'
import { useSpeechToText } from './useSpeechToText'

// ---------------------------------------------------------------------------
// Fake recognition: every start() creates an independent instance whose
// handlers are captured, so tests can drive stale sessions on purpose.
// ---------------------------------------------------------------------------

const recognitionBehavior = {
  autoStart: true,
  throwOnStart: false,
  throwOnStop: false,
  endOnStop: false,
  endOnAbort: false,
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = []

  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn(() => {
    if (recognitionBehavior.throwOnStart) throw new Error('Start failed')
    if (recognitionBehavior.autoStart) this.onstart?.()
  })

  stop = vi.fn(() => {
    if (recognitionBehavior.throwOnStop) throw new Error('Stop failed')
    if (recognitionBehavior.endOnStop) this.onend?.()
  })

  abort = vi.fn(() => {
    if (recognitionBehavior.endOnAbort) this.onend?.()
  })

  constructor() {
    MockSpeechRecognition.instances.push(this)
  }
}

const instances = () => MockSpeechRecognition.instances
const latest = () => instances()[instances().length - 1]
const invokeCount = (command: string) =>
  vi.mocked(invoke).mock.calls.filter((call) => call[0] === command).length

interface ResultPart {
  isFinal: boolean
  transcript: string
}

function resultEvent(parts: ResultPart[], resultIndex = 0) {
  const results: Record<string | number, unknown> = { length: parts.length }
  parts.forEach((part, index) => {
    results[index] = {
      isFinal: part.isFinal,
      length: 1,
      0: { transcript: part.transcript },
    }
  })
  return { resultIndex, results }
}

const interim = (text: string) => resultEvent([{ isFinal: false, transcript: text }])
const final = (text: string) => resultEvent([{ isFinal: true, transcript: text }])

function audioContextMock(state = 'running') {
  // Production calls `new AudioContext()`, so the double must be constructable.
  return class MockAudioContext {
    state = state
    resume = vi.fn().mockResolvedValue(undefined)
    sampleRate = 44100
    createBuffer = vi.fn(() => ({}))
    createBufferSource = vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    }))
    destination = {}
  }
}

describe('useSpeechToText', () => {
  beforeEach(() => {
    MockSpeechRecognition.instances = []
    recognitionBehavior.autoStart = true
    recognitionBehavior.throwOnStart = false
    recognitionBehavior.throwOnStop = false
    recognitionBehavior.endOnStop = false
    recognitionBehavior.endOnAbort = false
    mockIsVisible = true

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'tauri:', hostname: 'localhost' },
    })

    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    })

    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    })

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: audioContextMock(),
    })

    vi.mocked(invoke).mockClear()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // -- capability ----------------------------------------------------------

  it('reports supported when the recognition constructor exists', () => {
    const { result } = renderHook(() => useSpeechToText())
    expect(result.current.isSupported).toBe(true)
  })

  it('reports unsupported when no recognition constructor exists', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useSpeechToText())
    expect(result.current.isSupported).toBe(false)
  })

  it('never creates a session when the API is missing', async () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports unsupported in the dev runtime that crashes on recognition', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'http:' },
    })

    const { result } = renderHook(() => useSpeechToText())
    expect(result.current.isSupported).toBe(false)
  })

  it('settles idle with an actionable error in the dev runtime', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { protocol: 'http:' },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(0)
    warn.mockRestore()
  })

  it('returns initial state', () => {
    const { result } = renderHook(() => useSpeechToText())

    expect(result.current.isListening).toBe(false)
    expect(result.current.transcript).toBe('')
    expect(result.current.interimTranscript).toBe('')
    expect(result.current.silenceDetected).toBe(false)
    expect(result.current.error).toBeNull()
  })

  // -- start ---------------------------------------------------------------

  it('starts one configured recognition session', async () => {
    const { result } = renderHook(() => useSpeechToText({ lang: 'vi' }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(1)
    expect(latest().start).toHaveBeenCalledTimes(1)
    expect(latest().continuous).toBe(true)
    expect(latest().interimResults).toBe(true)
    expect(latest().lang).toBe('vi-VN')
    expect(invokeCount('activate_voice_session')).toBe(1)
    expect(result.current.isListening).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('maps auto and unknown languages to en-US', async () => {
    const auto = renderHook(() => useSpeechToText({ lang: 'auto' }))
    await act(async () => {
      await auto.result.current.startListening()
    })
    expect(latest().lang).toBe('en-US')

    const unknown = renderHook(() => useSpeechToText({ lang: 'nope' }))
    await act(async () => {
      await unknown.result.current.startListening()
    })
    expect(latest().lang).toBe('en-US')
  })

  it('marks listening only after the session reports onstart', async () => {
    recognitionBehavior.autoStart = false
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })
    expect(result.current.isListening).toBe(false)

    act(() => {
      latest().onstart?.()
    })
    expect(result.current.isListening).toBe(true)
  })

  it('rejects a duplicate start while the first start is still awaiting permission', async () => {
    let releasePermission: (value: { state: string }) => void = () => {}
    const pending = new Promise<{ state: string }>((resolve) => {
      releasePermission = resolve
    })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockReturnValue(pending) },
    })

    const { result } = renderHook(() => useSpeechToText())

    let firstStart: Promise<void>
    await act(async () => {
      firstStart = result.current.startListening()
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(0)

    await act(async () => {
      releasePermission({ state: 'granted' })
      await firstStart
    })

    expect(instances()).toHaveLength(1)
    expect(latest().start).toHaveBeenCalledTimes(1)
  })

  it('does not start a second session while listening', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })
    await act(async () => {
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(1)
  })

  // -- results -------------------------------------------------------------

  it('sends final text once and leaves no interim behind', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      latest().onresult?.(final(' Hello world '))
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('Hello world')
    expect(result.current.interimTranscript).toBe('')

    act(() => {
      latest().onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
  })

  it('exposes the newest interim transcript', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      latest().onresult?.(interim('Hello wor'))
    })

    expect(result.current.interimTranscript).toBe('Hello wor')
  })

  it('flushes the latest interim exactly once at a natural end', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('hel'))
    })
    act(() => {
      latest().onresult?.(interim('hello'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('hello')
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(result.current.interimTranscript).toBe('')
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    act(() => {
      recognition.onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('never replays an interim segment that a final segment superseded', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('hel'))
    })
    act(() => {
      latest().onresult?.(final('hello'))
    })
    act(() => {
      latest().onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('hello')
    expect(result.current.interimTranscript).toBe('')
  })

  it('handles a mixed final and interim result event', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(
        resultEvent([
          { isFinal: true, transcript: 'done' },
          { isFinal: false, transcript: 'pending' },
        ])
      )
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('done')
    expect(result.current.interimTranscript).toBe('pending')

    act(() => {
      latest().onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(2)
    expect(onTextReady).toHaveBeenLastCalledWith('pending')
  })

  it('drops pending interim text after clearTranscript', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('discard me'))
    })
    act(() => {
      result.current.clearTranscript()
    })

    expect(result.current.interimTranscript).toBe('')

    act(() => {
      latest().onend?.()
    })
    expect(onTextReady).not.toHaveBeenCalled()
  })

  // -- graceful stop -------------------------------------------------------

  it('flushes pending interim once on a graceful stop without calling onEnd', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('pending text'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })

    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(onTextReady).not.toHaveBeenCalled()

    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('pending text')
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    act(() => {
      recognition.onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('delivers a final result that arrives after a manual stop', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('hel'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })

    // The stopped session still owns the recognition until it reports onend
    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(onTextReady).not.toHaveBeenCalled()

    act(() => {
      recognition.onresult?.(final('hello'))
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('hello')
    expect(invokeCount('activate_voice_session')).toBe(0)

    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    expect(result.current.interimTranscript).toBe('')
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('keeps the pre-stop interim when a stopped session reports a later interim', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('hello'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })

    // A stopped session only drains confirmed text; a late interim guess must
    // not replace the snapshot the user already saw
    act(() => {
      recognition.onresult?.(interim('hel'))
    })

    expect(onTextReady).not.toHaveBeenCalled()
    expect(result.current.interimTranscript).toBe('hello')

    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('hello')
    expect(result.current.interimTranscript).toBe('')
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('activate_voice_session')).toBe(0)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('never resurrects interim text after a stopped session delivered its final', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })
    act(() => {
      recognition.onresult?.(final('hello world'))
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('hello world')

    act(() => {
      recognition.onresult?.(interim('hello wor'))
    })
    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(result.current.interimTranscript).toBe('')
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('activate_voice_session')).toBe(0)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('stays exactly-once when stop triggers a synchronous end', async () => {
    recognitionBehavior.endOnStop = true
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('pending text'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })

    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('settles a stop that the recognition cannot acknowledge', async () => {
    recognitionBehavior.throwOnStop = true
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('pending text'))
    })

    vi.mocked(invoke).mockClear()

    act(() => {
      result.current.stopListening()
    })

    // No onend can follow a stop that threw, so the session settles now
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('pending text')
    expect(onEnd).not.toHaveBeenCalled()
    expect(result.current.isListening).toBe(false)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('settles a stop that arrives before the recognition exists', async () => {
    let releasePermission: (value: { state: string }) => void = () => {}
    const pending = new Promise<{ state: string }>((resolve) => {
      releasePermission = resolve
    })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockReturnValue(pending) },
    })

    const { result } = renderHook(() => useSpeechToText())

    let start: Promise<void>
    act(() => {
      start = result.current.startListening()
    })

    act(() => {
      result.current.stopListening()
    })

    expect(result.current.isListening).toBe(false)
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    await act(async () => {
      releasePermission({ state: 'granted' })
      await start
    })

    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(0)
  })

  it('ignores stop when no session is running', () => {
    const { result } = renderHook(() => useSpeechToText())

    act(() => {
      result.current.stopListening()
    })

    expect(instances()).toHaveLength(0)
    expect(invokeCount('deactivate_voice_session')).toBe(0)
  })

  it('toggles a session on and off', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.toggleListening()
    })
    expect(result.current.isListening).toBe(true)

    await act(async () => {
      await result.current.toggleListening()
    })
    expect(latest().stop).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
  })

  // -- cancellation --------------------------------------------------------

  it('discards pending text and late events when the window hides', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const onError = vi.fn()
    const { result, rerender } = renderHook(() =>
      useSpeechToText({ onTextReady, onEnd, onError })
    )

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('dropped'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    mockIsVisible = false
    act(() => {
      rerender()
    })

    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(result.current.interimTranscript).toBe('')
    expect(onTextReady).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    act(() => {
      recognition.onresult?.(interim('late'))
      recognition.onerror?.({ error: 'network', message: '' })
      recognition.onend?.()
    })

    expect(onTextReady).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('cancels an active session exactly once on unmount', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result, unmount } = renderHook(() =>
      useSpeechToText({ onTextReady, onEnd })
    )

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('dropped'))
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    unmount()

    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(onTextReady).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('does not touch the native session on unmount when idle', () => {
    const { unmount } = renderHook(() => useSpeechToText())

    unmount()

    expect(invokeCount('deactivate_voice_session')).toBe(0)
  })

  // -- benign lifecycle events --------------------------------------------

  it('treats aborted as a benign lifecycle event', async () => {
    const onError = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })

    act(() => {
      latest().onerror?.({ error: 'aborted', message: '' })
    })

    expect(result.current.error).toBeNull()
    expect(onError).not.toHaveBeenCalled()

    act(() => {
      latest().onend?.()
    })
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('treats no-speech as a benign lifecycle event and still flushes at end', async () => {
    const onError = vi.fn()
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError, onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('kept'))
    })
    act(() => {
      latest().onerror?.({ error: 'no-speech', message: '' })
    })

    expect(result.current.error).toBeNull()
    expect(onError).not.toHaveBeenCalled()
    expect(result.current.silenceDetected).toBe(false)

    act(() => {
      latest().onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('kept')
  })

  // -- errors --------------------------------------------------------------

  it.each([
    ['not-allowed', 'Microphone access denied'],
    ['audio-capture', 'Microphone unavailable'],
    ['network', 'Speech recognition requires a network connection'],
    ['service-not-allowed', 'Speech recognition service unavailable'],
    ['language-not-supported', 'Speech recognition language not supported'],
    ['weird-code', 'Speech error: weird-code'],
  ])('normalizes the %s error exactly once', async (code, message) => {
    const onError = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })

    const recognition = latest()
    vi.mocked(invoke).mockClear()

    act(() => {
      recognition.onerror?.({ error: code, message: '' })
    })

    expect(result.current.error).toBe(message)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(message)
    expect(onEnd).not.toHaveBeenCalled()
    expect(result.current.isListening).toBe(false)
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    act(() => {
      recognition.onerror?.({ error: code, message: '' })
      recognition.onend?.()
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('flushes recognized text once when a service error ends the session', async () => {
    const onTextReady = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady }))

    await act(async () => {
      await result.current.startListening()
    })
    act(() => {
      latest().onresult?.(interim('salvaged'))
    })
    act(() => {
      latest().onerror?.({ error: 'network', message: '' })
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('salvaged')

    act(() => {
      latest().onend?.()
    })
    expect(onTextReady).toHaveBeenCalledTimes(1)
  })

  it('keeps a denied microphone retryable', async () => {
    const onError = vi.fn()
    const query = vi
      .fn()
      .mockResolvedValueOnce({ state: 'denied' })
      .mockResolvedValue({ state: 'granted' })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query },
    })

    const { result } = renderHook(() => useSpeechToText({ onError }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Microphone access denied')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.isSupported).toBe(true)
    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(0)
    expect(invokeCount('deactivate_voice_session')).toBe(0)

    await act(async () => {
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(1)
    expect(result.current.isListening).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('recovers from a recognition that throws on start', async () => {
    recognitionBehavior.throwOnStart = true
    const onError = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onError }))

    vi.mocked(invoke).mockClear()
    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.error).toBe('Start failed')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)
    expect(invokeCount('deactivate_voice_session')).toBe(1)

    recognitionBehavior.throwOnStart = false
    await act(async () => {
      await result.current.startListening()
    })

    expect(instances()).toHaveLength(2)
    expect(result.current.isListening).toBe(true)
    expect(result.current.error).toBeNull()
  })

  // -- permission fallbacks ------------------------------------------------

  it('starts when the permissions query rejects', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockRejectedValue(new Error('Not supported')) },
    })

    const { result } = renderHook(() => useSpeechToText())
    await act(async () => {
      await result.current.startListening()
    })

    expect(latest().start).toHaveBeenCalledTimes(1)
  })

  it('starts when the permissions API is missing', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    })

    const { result } = renderHook(() => useSpeechToText())
    await act(async () => {
      await result.current.startListening()
    })

    expect(latest().start).toHaveBeenCalledTimes(1)
  })

  it('starts when permission is still in the prompt state', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
    })

    const { result } = renderHook(() => useSpeechToText())
    await act(async () => {
      await result.current.startListening()
    })

    expect(latest().start).toHaveBeenCalledTimes(1)
  })

  it('starts even when the native voice session cannot be activated', async () => {
    // The rejection value is the native layer's own error. It reaches the
    // console as a diagnostic only, never as a payload.
    const ACTIVATION_SENTINEL = 'ZZ-ACTIVATION-SENTINEL-ZZ'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(invoke).mockImplementation((command: string) =>
      command === 'activate_voice_session'
        ? Promise.reject(new Error(ACTIVATION_SENTINEL))
        : Promise.resolve(undefined)
    )

    const { result } = renderHook(() => useSpeechToText())
    await act(async () => {
      await result.current.startListening()
    })

    expect(latest().start).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(true)

    expect(warn).toHaveBeenCalledTimes(1)
    const args = warn.mock.calls[0] as unknown[]
    expect(args).toHaveLength(1)
    expect(typeof args[0]).toBe('string')
    expect(args[0] as string).not.toContain(ACTIVATION_SENTINEL)

    warn.mockRestore()
  })

  // -- stale sessions ------------------------------------------------------

  it('ignores every late event from a replaced session', async () => {
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useSpeechToText({ onTextReady, onEnd, onError })
    )

    await act(async () => {
      await result.current.startListening()
    })
    const first = latest()
    act(() => {
      first.onresult?.(interim('old session'))
    })
    act(() => {
      first.onend?.()
    })

    onTextReady.mockClear()
    onEnd.mockClear()

    await act(async () => {
      await result.current.startListening()
    })
    const second = latest()
    expect(second).not.toBe(first)
    act(() => {
      second.onresult?.(interim('new session'))
    })

    vi.mocked(invoke).mockClear()
    act(() => {
      first.onresult?.(interim('zombie'))
      first.onerror?.({ error: 'network', message: '' })
      first.onend?.()
    })

    expect(result.current.isListening).toBe(true)
    expect(result.current.interimTranscript).toBe('new session')
    expect(result.current.error).toBeNull()
    expect(onTextReady).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(invokeCount('deactivate_voice_session')).toBe(0)
  })

  it('installs nothing when the awaited start is cancelled by unmount', async () => {
    let releasePermission: (value: { state: string }) => void = () => {}
    const pending = new Promise<{ state: string }>((resolve) => {
      releasePermission = resolve
    })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockReturnValue(pending) },
    })

    const { result, unmount } = renderHook(() => useSpeechToText())

    let start: Promise<void>
    act(() => {
      start = result.current.startListening()
    })

    unmount()
    vi.mocked(invoke).mockClear()

    await act(async () => {
      releasePermission({ state: 'granted' })
      await start
    })

    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(0)
  })

  it('leaves no audio active when the awaited start is cancelled after activation', async () => {
    let releaseActivation: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      releaseActivation = () => resolve()
    })
    vi.mocked(invoke).mockImplementation((command: string) =>
      command === 'activate_voice_session' ? pending : Promise.resolve(undefined)
    )

    const { result, unmount } = renderHook(() => useSpeechToText())

    let start: Promise<void>
    await act(async () => {
      start = result.current.startListening()
    })

    unmount()

    await act(async () => {
      releaseActivation()
      await start
    })

    expect(instances()).toHaveLength(0)
    const commands = vi.mocked(invoke).mock.calls.map((call) => call[0])
    expect(commands[commands.length - 1]).toBe('deactivate_voice_session')
  })

  it('deactivates once and only after a cancelled start finishes acquiring audio', async () => {
    let releaseActivation: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      releaseActivation = () => resolve()
    })
    vi.mocked(invoke).mockImplementation((command: string) =>
      command === 'activate_voice_session' ? pending : Promise.resolve(undefined)
    )

    const { result, rerender } = renderHook(() => useSpeechToText())

    let start: Promise<void>
    await act(async () => {
      start = result.current.startListening()
    })

    mockIsVisible = false
    act(() => {
      rerender()
    })

    // Releasing audio that is still being acquired can outrun the acquisition
    expect(invokeCount('deactivate_voice_session')).toBe(0)

    await act(async () => {
      releaseActivation()
      await start
    })

    expect(instances()).toHaveLength(0)
    expect(invokeCount('activate_voice_session')).toBe(1)
    expect(invokeCount('deactivate_voice_session')).toBe(1)
  })

  it('never deactivates a newer session when a cancelled start resolves late', async () => {
    let releaseActivation: () => void = () => {}
    let pendingActivations = 0
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command !== 'activate_voice_session') return Promise.resolve(undefined)
      pendingActivations += 1
      if (pendingActivations > 1) return Promise.resolve(undefined)
      return new Promise<void>((resolve) => {
        releaseActivation = () => resolve()
      })
    })

    const { result, rerender } = renderHook(() => useSpeechToText())

    let firstStart: Promise<void>
    await act(async () => {
      firstStart = result.current.startListening()
    })

    mockIsVisible = false
    act(() => {
      rerender()
    })
    mockIsVisible = true
    act(() => {
      rerender()
    })

    await act(async () => {
      await result.current.startListening()
    })
    expect(result.current.isListening).toBe(true)

    const deactivationsBefore = invokeCount('deactivate_voice_session')
    await act(async () => {
      releaseActivation()
      await firstStart
    })

    expect(instances()).toHaveLength(1)
    expect(result.current.isListening).toBe(true)
    expect(invokeCount('deactivate_voice_session')).toBe(deactivationsBefore)
  })

  // -- silence timer -------------------------------------------------------

  it('auto-stops the session after the silence timeout', async () => {
    vi.useFakeTimers()
    const onTextReady = vi.fn()
    const onEnd = vi.fn()
    const { result } = renderHook(() => useSpeechToText({ onTextReady, onEnd }))

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.silenceDetected).toBe(true)

    const recognition = latest()
    act(() => {
      recognition.onresult?.(interim('trailing'))
    })

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    expect(recognition.stop).toHaveBeenCalledTimes(1)
    expect(result.current.isListening).toBe(false)

    act(() => {
      recognition.onend?.()
    })

    expect(onTextReady).toHaveBeenCalledTimes(1)
    expect(onTextReady).toHaveBeenCalledWith('trailing')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('reactivates the native session when speech resumes', async () => {
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })

    vi.mocked(invoke).mockClear()
    act(() => {
      latest().onresult?.(interim('speaking'))
    })

    expect(invokeCount('activate_voice_session')).toBe(1)
  })

  it('leaves a stale silence timer harmless after the session ended', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSpeechToText())

    await act(async () => {
      await result.current.startListening()
    })
    const first = latest()
    act(() => {
      first.onend?.()
    })

    await act(async () => {
      await result.current.startListening()
    })
    const second = latest()

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    expect(first.stop).not.toHaveBeenCalled()
    expect(second.stop).toHaveBeenCalledTimes(1)
  })

  // -- audio context workarounds ------------------------------------------

  it('resumes a suspended audio context during cleanup', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: audioContextMock('suspended'),
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

  it('falls back to webkitAudioContext', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: audioContextMock(),
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

  it('survives an audio context constructor failure', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class FailingAudioContext {
        constructor() {
          throw new Error('no audio')
        }
      },
    })
    Object.defineProperty(window, 'webkitAudioContext', {
      configurable: true,
      value: undefined,
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
