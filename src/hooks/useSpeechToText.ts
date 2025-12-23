import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

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
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
  clearTranscript: () => void
}

// Check if running in Tauri dev mode (no Info.plist = will crash on speech recognition)
function isDevMode(): boolean {
  // In dev mode, the app runs from http://localhost
  // In production, it runs from tauri://localhost
  // Check protocol - only http: is dev mode, tauri: is production
  return window.location.protocol === 'http:'
}

// Check if microphone permission is granted (non-crashing check)
async function checkMicrophonePermission(): Promise<boolean> {
  // In dev mode, speech recognition will crash due to missing Info.plist
  // Only the built app has the plist merged
  if (isDevMode()) {
    console.warn('[Speech] Speech recognition disabled in dev mode - build the app to test')
    return false
  }

  try {
    // First check if we can query permissions
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      if (result.state === 'denied') return false
    }
    // Try to get microphone access - this won't crash WKWebView
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Stop all tracks immediately
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch {
    return false
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
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isStoppingRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSpeechTimeRef = useRef<number>(0)
  const accumulatedTextRef = useRef('')

  // Check browser support - API must exist AND microphone permission must be granted
  const hasAPI = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  const isSupported = hasAPI && micPermissionGranted === true

  // Check microphone permission on mount
  useEffect(() => {
    if (hasAPI && micPermissionGranted === null) {
      checkMicrophonePermission().then(setMicPermissionGranted)
    }
  }, [hasAPI, micPermissionGranted])

  // Get speech API language code
  const getSpeechLang = useCallback((appLang: string): string => {
    if (appLang === 'auto') return 'en-US'
    return SPEECH_LANG_MAP[appLang] || 'en-US'
  }, [])

  // Clear silence timer
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    setSilenceDetected(false)
  }, [])

  // Start silence detection timer
  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    setSilenceDetected(true)
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop after silence timeout
      if (recognitionRef.current && !isStoppingRef.current) {
        isStoppingRef.current = true
        recognitionRef.current.stop()
      }
    }, SILENCE_TIMEOUT)
  }, [clearSilenceTimer])

  // Initialize recognition
  const createRecognition = useCallback(() => {
    if (!isSupported) return null

    const SpeechRecognitionAPI = window.webkitSpeechRecognition || window.SpeechRecognition
    const recognition = new SpeechRecognitionAPI()

    // Enable continuous mode for ongoing dictation
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = getSpeechLang(lang)

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
      isStoppingRef.current = false
      lastSpeechTimeRef.current = Date.now()
      // Start initial silence timer
      startSilenceTimer()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Reset silence timer on any result
      lastSpeechTimeRef.current = Date.now()
      clearSilenceTimer()

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
        // Send to input immediately
        onTextReady?.(confirmedText.trim())
        // Clear transcript for next segment (text is already in input)
        accumulatedTextRef.current = ''
        setTranscript('')
        setInterimTranscript('')
      }

      if (interim) {
        setInterimTranscript(interim)
      }

      // Restart silence timer after processing
      startSilenceTimer()
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearSilenceTimer()

      // Ignore 'aborted' errors (user stopped) and 'no-speech' in continuous mode
      if (event.error === 'aborted') return
      if (event.error === 'no-speech') {
        // In continuous mode, no-speech is handled by silence timer
        return
      }

      const errorMsg = event.error === 'not-allowed'
        ? 'Microphone access denied'
        : `Speech error: ${event.error}`

      setError(errorMsg)
      onError?.(errorMsg)
      setIsListening(false)
    }

    recognition.onend = () => {
      clearSilenceTimer()
      setIsListening(false)

      // Include any pending interim text
      if (interimTranscript) {
        onTextReady?.(interimTranscript.trim())
      }

      // Deactivate audio session when recognition ends (e.g., silence timeout)
      invoke('deactivate_voice_session').catch(() => {})

      if (!isStoppingRef.current) {
        onEnd?.()
      }
    }

    return recognition
  }, [isSupported, lang, getSpeechLang, onTextReady, onEnd, onError, startSilenceTimer, clearSilenceTimer, interimTranscript])

  // Start listening
  const startListening = useCallback(async () => {
    if (!hasAPI || isListening) return

    // Reset state
    accumulatedTextRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setSilenceDetected(false)
    setError(null)

    // Request microphone permission first (prevents WKWebView crash)
    if (!micPermissionGranted) {
      const granted = await checkMicrophonePermission()
      setMicPermissionGranted(granted)
      if (!granted) {
        const errorMsg = 'Microphone access denied'
        setError(errorMsg)
        onError?.(errorMsg)
        return
      }
    }

    // Activate native audio session for voice recording
    // This properly configures macOS audio routing
    try {
      await invoke('activate_voice_session')
    } catch (e) {
      console.warn('Failed to activate voice session:', e)
      // Continue anyway - speech recognition may still work
    }

    const recognition = createRecognition()
    if (recognition) {
      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch (e) {
        // Deactivate session if recognition fails to start
        invoke('deactivate_voice_session').catch(() => {})
        const errorMsg = e instanceof Error ? e.message : 'Failed to start speech recognition'
        setError(errorMsg)
        onError?.(errorMsg)
      }
    }
  }, [hasAPI, isListening, micPermissionGranted, createRecognition, onError])

  // Stop listening
  const stopListening = useCallback(() => {
    clearSilenceTimer()
    if (recognitionRef.current && isListening) {
      isStoppingRef.current = true
      recognitionRef.current.stop()
    }
    // Deactivate native audio session to restore system audio quality
    // The notifyOthersOnDeactivation flag tells macOS to restore previous audio routes
    invoke('deactivate_voice_session').catch((e) => {
      console.warn('Failed to deactivate voice session:', e)
    })
  }, [isListening, clearSilenceTimer])

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  // Clear transcript
  const clearTranscript = useCallback(() => {
    accumulatedTextRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer()
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      // Ensure audio session is deactivated on cleanup
      invoke('deactivate_voice_session').catch(() => {})
    }
  }, [clearSilenceTimer])

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
