import { useCallback, useRef, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { TranslationService } from '../services/translation-service'
import { translationCache, createTranslationKey } from '../lib/cache'

export function useTranslation() {
  const {
    inputText,
    setInputText,
    setOutputText,
    sourceLang,
    targetLang,
    setSourceLang,
    setLoading,
    setError,
  } = useAppStore()

  const { translationModel, ollamaHost, useStreaming } = useSettingsStore()
  const abortRef = useRef<AbortController | null>(null)

  // Create service instance (memoized)
  const service = useMemo(
    () => new TranslationService({ modelName: translationModel, ollamaHost }),
    [translationModel, ollamaHost]
  )

  const translate = useCallback(async (text?: string, options?: { skipCache?: boolean }) => {
    const textToProcess = text || inputText
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)
    setOutputText('')

    try {
      // Detect source language if auto
      const detectedSource = sourceLang === 'auto'
        ? service.detectSourceLanguage(textToProcess)
        : sourceLang

      if (sourceLang === 'auto') {
        setSourceLang(detectedSource)
      }

      // Check cache (skip if regenerating)
      const cacheKey = createTranslationKey(textToProcess, detectedSource, targetLang, translationModel)
      if (!skipCache) {
        const cached = translationCache.get(cacheKey)
        if (cached) {
          setOutputText(cached)
          setLoading(false)
          return cached
        }
      }

      let result = ''

      if (useStreaming) {
        for await (const chunk of service.translateStream(textToProcess, detectedSource, targetLang)) {
          result = chunk
          setOutputText(result)
        }
      } else {
        const response = await service.translate(textToProcess, detectedSource, targetLang)
        result = response.translated
        setOutputText(result)
      }

      // Cache result
      translationCache.set(cacheKey, result)

      setLoading(false)
      return result
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const errorMsg = err instanceof Error ? err.message : 'Translation failed'
      setError(errorMsg)
      setLoading(false)
      throw err
    }
  }, [
    inputText,
    sourceLang,
    targetLang,
    translationModel,
    useStreaming,
    service,
    setOutputText,
    setSourceLang,
    setLoading,
    setError,
  ])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setLoading(false)
    }
  }, [setLoading])

  const translateText = useCallback(async (text: string) => {
    setInputText(text)
    return translate(text)
  }, [translate, setInputText])

  return {
    translate,
    translateText,
    cancel,
  }
}
