import { useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { detectLanguage, shouldUseCorrection } from '../lib/language'

export function useLanguageDetect() {
  const {
    inputText,
    targetLang,
    setSourceLang,
    setMode,
  } = useAppStore()

  const detect = useCallback((text: string) => {
    if (!text.trim()) return 'en'
    return detectLanguage(text)
  }, [])

  const autoDetectAndSetMode = useCallback((text: string) => {
    const detected = detect(text)
    setSourceLang(detected)

    // Auto-set mode based on detected language vs target
    if (shouldUseCorrection(text, targetLang)) {
      setMode('correct')
    } else {
      setMode('translate')
    }

    return detected
  }, [detect, targetLang, setSourceLang, setMode])

  // Auto-detect when input changes
  useEffect(() => {
    if (inputText.trim()) {
      autoDetectAndSetMode(inputText)
    }
  }, [inputText, autoDetectAndSetMode])

  return {
    detect,
    autoDetectAndSetMode,
  }
}
