import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useWindowVisibility } from './useWindowVisibility'

// Web Speech API types (not in standard lib)
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition
    SpeechRecognition: new () => SpeechRecognition
  }
}

// Map app language codes to Web Speech API codes
const SPEECH_LANG_MAP: Record<string, string> = {
  vi: 'vi-VN',
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
}

// Silence timeout in milliseconds
const SILENCE_TIMEOUT = 2500

const MIC_DENIED_ERROR = 'Microphone access denied'

// Web Speech error codes that end a session without being a user-facing failure
const BENIGN_ERROR_CODES = ['aborted', 'no-speech']

// Normalized, actionable message for every reported recognition error
function normalizeError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return MIC_DENIED_ERROR
    case 'audio-capture':
      return 'Microphone unavailable'
    case 'network':
      return 'Speech recognition requires a network connection'
    case 'service-not-allowed':
      return 'Speech recognition service unavailable'
    case 'language-not-supported':
      return 'Speech recognition language not supported'
    default:
      return `Speech error: ${code}`
  }
}

export interface UseSpeechToTextOptions {
  lang?: string // App language code (e.g., 'vi', 'ja', 'en')
  onTextReady?: (text: string) => void // Called when final text is ready to append
  onEnd?: () => void
  onError?: (error: string) => void
}

export interface UseSpeechToTextReturn {
  isListening: boolean
  isSupported: boolean
  transcript: string
  interimTranscript: string
  silenceDetected: boolean // True when silence is being detected
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => void
  toggleListening: () => Promise<void>
  clearTranscript: () => void
}

// How the current session is expected to terminate
type TerminationIntent = 'none' | 'stop' | 'cancel'

// One owned recognition attempt. Every native event carries its session, so an
// event from a replaced attempt is recognizable and ignorable.
interface SpeechSession {
  id: number
  recognition: SpeechRecognition | null
  timer: ReturnType<typeof setTimeout> | null
  intent: TerminationIntent
  finalized: boolean
  // Pending native audio acquisition; null once it has settled
  activation: Promise<void> | null
  released: boolean
}

interface FinalizeOptions {
  flushInterim: boolean
  callOnEnd: boolean
  errorMessage?: string
}

// Check if running in Tauri dev mode (no Info.plist = will crash on speech recognition)
function isDevMode(): boolean {
  // In dev mode, the app runs from http://localhost
  // In production, it runs from tauri://localhost
  // Check protocol - only http: is dev mode, tauri: is production
  return window.location.protocol === 'http:'
}

// Cached AudioContext for resetting WebKit's audio session
// Reused to avoid creating new contexts on every call
let cachedAudioContext: AudioContext | null = null

// Get or create a reusable AudioContext
function getAudioContext(): AudioContext {
  if (!cachedAudioContext || cachedAudioContext.state === 'closed') {
    cachedAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return cachedAudioContext
}

// Play silent audio to reset WebKit's audio session and restore system audio
// This is a workaround for macOS where AVAudioSession doesn't exist
function resetAudioSession(): void {
  try {
    const audioContext = getAudioContext()

    // Resume context if suspended (browsers may suspend inactive contexts)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
    }

    // Create a silent buffer (100ms)
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate)
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.start()
    // No need to close - context is reused
  } catch {
    // Ignore errors - this is just a workaround
  }
}

// Check if microphone permission is granted (without triggering audio session)
async function checkMicrophonePermission(): Promise<boolean> {
  try {
    // Only check via permissions API - don't use getUserMedia as it triggers audio ducking
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      // If granted or prompt, allow - SpeechRecognition will handle the actual request
      return result.state !== 'denied'
    }
    // If no permissions API, assume we can try
    return true
  } catch {
    // If permissions query fails, let SpeechRecognition try anyway
    return true
  }
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const {
    lang = 'en',
    onTextReady,
    onEnd,
    onError,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [silenceDetected, setSilenceDetected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track window visibility for lazy/active mode. This hook owns the native
  // voice-session cleanup for a hidden window; useWindowVisibility only reports.
  const { isVisible } = useWindowVisibility()

  // Latest-value refs: native handlers must never read render-time values
  const langRef = useRef(lang)
  const onTextReadyRef = useRef(onTextReady)
  const onEndRef = useRef(onEnd)
  const onErrorRef = useRef(onError)
  langRef.current = lang
  onTextReadyRef.current = onTextReady
  onEndRef.current = onEnd
  onErrorRef.current = onError

  const sessionRef = useRef<SpeechSession | null>(null)
  const sessionIdRef = useRef(0)
  const interimTranscriptRef = useRef('')
  const permissionGrantedRef = useRef(false)
  const mountedRef = useRef(true)

  // Support is a capability question only: the constructor must exist and the
  // runtime must not be the dev build that crashes on recognition. A denied or
  // failed attempt stays retryable and is reported as an error instead.
  const isSupported = typeof window !== 'undefined' &&
    Boolean(window.webkitSpeechRecognition || window.SpeechRecognition) &&
    !isDevMode()

  // Get speech API language code
  const getSpeechLang = useCallback((appLang: string): string => {
    if (appLang === 'auto') return 'en-US'
    return SPEECH_LANG_MAP[appLang] || 'en-US'
  }, [])

  // A session may only act while it is the owned, unfinished one
  const isCurrent = useCallback((session: SpeechSession) => {
    return sessionRef.current === session && !session.finalized
  }, [])

  // A stopped session still owns its recognition, but no longer listens
  const isRunning = useCallback((session: SpeechSession) => {
    return sessionRef.current === session && !session.finalized && session.intent === 'none'
  }, [])

  // The native audio session is one shared resource, so a session releases it
  // at most once, never before its own acquisition settled, and never when a
  // newer session has already taken ownership of it.
  const releaseSessionAudio = useCallback((session: SpeechSession) => {
    if (session.released) return
    session.released = true

    const release = () => {
      if (sessionRef.current) return
      invoke('deactivate_voice_session').catch(() => {})
      // Reset WebKit's audio session to restore system audio (macOS workaround)
      resetAudioSession()
    }

    if (session.activation) {
      session.activation.then(release, release)
      return
    }
    release()
  }, [])

  // Clear this session's silence timer
  const clearSilenceTimer = useCallback((session: SpeechSession, reactivateSession = false) => {
    if (session.timer) {
      clearTimeout(session.timer)
      session.timer = null
      // Re-activate audio session only when user speaks again (not when stopping)
      if (reactivateSession) {
        invoke('activate_voice_session').catch(() => {})
      }
    }
    if (mountedRef.current) setSilenceDetected(false)
  }, [])

  // The single cleanup boundary: timers, handlers, listening state, pending
  // text, and the native audio session all settle here exactly once.
  const finalizeSession = useCallback((session: SpeechSession, { flushInterim, callOnEnd, errorMessage }: FinalizeOptions) => {
    if (!isCurrent(session)) return

    session.finalized = true
    sessionRef.current = null

    if (session.timer) {
      clearTimeout(session.timer)
      session.timer = null
    }

    const recognition = session.recognition
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      session.recognition = null
    }

    const pendingText = interimTranscriptRef.current.trim()
    interimTranscriptRef.current = ''

    if (mountedRef.current) {
      setIsListening(false)
      setSilenceDetected(false)
      setInterimTranscript('')
      setTranscript('')
      if (errorMessage) setError(errorMessage)
    }

    releaseSessionAudio(session)

    if (flushInterim && pendingText) {
      onTextReadyRef.current?.(pendingText)
    }
    if (errorMessage) {
      onErrorRef.current?.(errorMessage)
    }
    if (callOnEnd) {
      onEndRef.current?.()
    }
  }, [isCurrent, releaseSessionAudio])

  // Graceful stop: the session keeps ownership until the recognition reports
  // onend, so a final result that arrives after stop() still reaches the
  // caller. Only the listening indicator settles now; cleanup stays in
  // finalizeSession and still runs exactly once.
  const stopSession = useCallback((session: SpeechSession) => {
    if (!isCurrent(session) || session.intent !== 'none') return

    session.intent = 'stop'
    clearSilenceTimer(session)
    if (mountedRef.current) setIsListening(false)

    const recognition = session.recognition
    if (!recognition) {
      // Nothing native to wait for: no onend will ever arrive
      finalizeSession(session, { flushInterim: true, callOnEnd: false })
      return
    }

    try {
      recognition.stop()
    } catch {
      // A recognition that cannot stop will never report onend
      finalizeSession(session, { flushInterim: true, callOnEnd: false })
    }
  }, [isCurrent, clearSilenceTimer, finalizeSession])

  // Cancellation: discard pending text and silence every late event
  const cancelSession = useCallback((session: SpeechSession) => {
    if (!isCurrent(session) || session.intent === 'cancel') return

    session.intent = 'cancel'
    const recognition = session.recognition
    interimTranscriptRef.current = ''
    finalizeSession(session, { flushInterim: false, callOnEnd: false })
    recognition?.abort()
  }, [isCurrent, finalizeSession])

  // Start this session's silence detection timer
  const startSilenceTimer = useCallback((session: SpeechSession) => {
    clearSilenceTimer(session)
    if (mountedRef.current) setSilenceDetected(true)

    // Deactivate audio session immediately when silence detected
    // This restores other apps' audio volume without waiting for timeout
    invoke('deactivate_voice_session').catch(() => {})

    session.timer = setTimeout(() => {
      session.timer = null
      // Auto-stop after silence timeout - a stale timer must change nothing
      stopSession(session)
    }, SILENCE_TIMEOUT)
  }, [clearSilenceTimer, stopSession])

  // Install handlers for one owned session
  const createRecognition = useCallback((session: SpeechSession): SpeechRecognition => {
    const SpeechRecognitionAPI = window.webkitSpeechRecognition || window.SpeechRecognition
    const recognition = new SpeechRecognitionAPI()

    // Enable continuous mode for ongoing dictation
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = getSpeechLang(langRef.current)

    recognition.onstart = () => {
      if (!isRunning(session)) return
      if (mountedRef.current) {
        setIsListening(true)
        setError(null)
      }
      startSilenceTimer(session)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isCurrent(session)) return

      // Reset silence timer on any result - reactivate audio session for new
      // speech. A stopped session is only draining its last results, so it
      // must not re-acquire audio or arm another timer.
      const running = isRunning(session)
      if (running) clearSilenceTimer(session, true)

      let confirmedText = ''
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          confirmedText += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (confirmedText) {
        // Final text is delivered now, so it can never be flushed again
        interimTranscriptRef.current = ''
        if (mountedRef.current) {
          setTranscript('')
          setInterimTranscript('')
        }
        onTextReadyRef.current?.(confirmedText.trim())
      }

      // Interim text is a guess about speech still in progress. A stopped
      // session is only draining confirmed results, so its interim guesses may
      // not overwrite the snapshot the user left behind or resurrect text a
      // final result already delivered.
      if (interim && running) {
        interimTranscriptRef.current = interim
        if (mountedRef.current) setInterimTranscript(interim)
      }

      // Restart silence timer after processing
      if (running) startSilenceTimer(session)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!isCurrent(session)) return

      // Benign lifecycle codes: the following onend settles the session
      if (BENIGN_ERROR_CODES.includes(event.error)) {
        clearSilenceTimer(session)
        return
      }

      finalizeSession(session, {
        flushInterim: true,
        callOnEnd: false,
        errorMessage: normalizeError(event.error),
      })
    }

    recognition.onend = () => {
      if (!isCurrent(session)) return
      finalizeSession(session, {
        flushInterim: true,
        callOnEnd: session.intent === 'none',
      })
    }

    return recognition
  }, [getSpeechLang, isCurrent, isRunning, clearSilenceTimer, startSilenceTimer, finalizeSession])

  // Settle a session that never reached the native layer
  const failStart = useCallback((session: SpeechSession, message: string) => {
    if (!isCurrent(session)) return

    session.finalized = true
    sessionRef.current = null
    if (mountedRef.current) {
      setIsListening(false)
      setError(message)
    }
    onErrorRef.current?.(message)
  }, [isCurrent])

  // Start listening
  const startListening = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!(window.webkitSpeechRecognition || window.SpeechRecognition)) return
    // One owned session at a time, including while a start is still awaiting
    if (sessionRef.current) return

    const session: SpeechSession = {
      id: ++sessionIdRef.current,
      recognition: null,
      timer: null,
      intent: 'none',
      finalized: false,
      activation: null,
      released: false,
    }
    sessionRef.current = session

    // Reset state
    interimTranscriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setSilenceDetected(false)
    setError(null)

    // Speech recognition crashes the dev runtime (no merged Info.plist)
    if (isDevMode()) {
      console.warn('[Speech] Speech recognition disabled in dev mode - build the app to test')
      failStart(session, MIC_DENIED_ERROR)
      return
    }

    // Request microphone permission first (prevents WKWebView crash)
    if (!permissionGrantedRef.current) {
      const granted = await checkMicrophonePermission()
      if (!isCurrent(session)) return
      if (!granted) {
        failStart(session, MIC_DENIED_ERROR)
        return
      }
      permissionGrantedRef.current = true
    }

    // Activate native audio session for voice recording
    // This properly configures macOS audio routing
    const activation = invoke('activate_voice_session')
    // A cancellation during this await must wait for the acquisition it undoes
    session.activation = activation.then(() => undefined, () => undefined)
    try {
      await activation
    } catch (e) {
      console.warn('Failed to activate voice session:', e)
      // Continue anyway - speech recognition may still work
    }
    session.activation = null

    if (!isCurrent(session) || !mountedRef.current) {
      // The await was invalidated - release what we just activated. A release
      // the cancellation already requested settles this exactly once.
      releaseSessionAudio(session)
      return
    }

    const recognition = createRecognition(session)
    session.recognition = recognition

    try {
      recognition.start()
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to start speech recognition'
      finalizeSession(session, { flushInterim: false, callOnEnd: false, errorMessage: errorMsg })
    }
  }, [createRecognition, failStart, finalizeSession, isCurrent, releaseSessionAudio])

  // Stop listening
  const stopListening = useCallback(() => {
    const session = sessionRef.current
    if (session) stopSession(session)
  }, [stopSession])

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (sessionRef.current) {
      stopListening()
    } else {
      await startListening()
    }
  }, [startListening, stopListening])

  // Clear transcript
  const clearTranscript = useCallback(() => {
    interimTranscriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // Cancel the session when the window becomes invisible (lazy mode)
  // This releases audio resources when the app is minimized to the menu bar
  useEffect(() => {
    if (isVisible) return
    const session = sessionRef.current
    if (session) cancelSession(session)
  }, [isVisible, cancelSession])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const session = sessionRef.current
      if (session) cancelSession(session)
    }
  }, [cancelSession])

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    silenceDetected,
    error,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
  }
}
