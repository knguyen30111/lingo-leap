import { useState, useCallback, useRef, useEffect } from 'react'

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

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isStoppingRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSpeechTimeRef = useRef<number>(0)
  const accumulatedTextRef = useRef('')

  // Check browser support
  const isSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

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

      if (!isStoppingRef.current) {
        onEnd?.()
      }
    }

    return recognition
  }, [isSupported, lang, getSpeechLang, onTextReady, onEnd, onError, startSilenceTimer, clearSilenceTimer, interimTranscript])

  // Start listening
  const startListening = useCallback(() => {
    if (!isSupported || isListening) return

    // Reset state
    accumulatedTextRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setSilenceDetected(false)
    setError(null)

    const recognition = createRecognition()
    if (recognition) {
      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch {
        setError('Failed to start speech recognition')
      }
    }
  }, [isSupported, isListening, createRecognition])

  // Stop listening
  const stopListening = useCallback(() => {
    clearSilenceTimer()
    if (recognitionRef.current && isListening) {
      isStoppingRef.current = true
      recognitionRef.current.stop()
    }
  }, [isListening, clearSilenceTimer])

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
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
