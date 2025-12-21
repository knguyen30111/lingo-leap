import { useState, useCallback, useRef, useEffect } from 'react'

// Map app language codes to Web Speech API codes
const TTS_LANG_MAP: Record<string, string> = {
  vi: 'vi-VN',
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
}


export interface UseTextToSpeechOptions {
  lang?: string
  rate?: number // 0.1 to 10, default 1
  pitch?: number // 0 to 2, default 1
  onEnd?: () => void
  onError?: (error: string) => void
}

export interface UseTextToSpeechReturn {
  isSpeaking: boolean
  isSupported: boolean
  error: string | null
  speak: (text: string, lang?: string) => void
  stop: () => void
  pause: () => void
  resume: () => void
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}): UseTextToSpeechReturn {
  const {
    lang = 'en',
    rate = 1,
    pitch = 1,
    onEnd,
    onError,
  } = options

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Check browser support
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Get TTS language code
  const getTTSLang = useCallback((appLang: string): string => {
    if (appLang === 'auto') return 'en-US'
    return TTS_LANG_MAP[appLang] || 'en-US'
  }, [])

  // Speak text
  const speak = useCallback((text: string, overrideLang?: string) => {
    if (!isSupported || !text.trim()) return

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const targetLang = overrideLang || lang
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = getTTSLang(targetLang)
    utterance.rate = rate
    utterance.pitch = pitch

    utterance.onstart = () => {
      setIsSpeaking(true)
      setError(null)
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      onEnd?.()
    }

    utterance.onerror = (event) => {
      // Ignore 'interrupted' and 'canceled' errors (user stopped)
      if (event.error === 'interrupted' || event.error === 'canceled') {
        setIsSpeaking(false)
        return
      }

      const errorMsg = `Speech error: ${event.error}`
      setError(errorMsg)
      setIsSpeaking(false)
      onError?.(errorMsg)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [isSupported, lang, rate, pitch, getTTSLang, onEnd, onError])

  // Stop speaking
  const stop = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [isSupported])

  // Pause speaking
  const pause = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.pause()
  }, [isSupported])

  // Resume speaking
  const resume = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.resume()
  }, [isSupported])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel()
      }
    }
  }, [isSupported])

  return {
    isSpeaking,
    isSupported,
    error,
    speak,
    stop,
    pause,
    resume,
  }
}
