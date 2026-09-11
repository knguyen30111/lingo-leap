import { useCallback, useEffect, useRef, useMemo } from 'react'
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
  const requestIdRef = useRef(0)

  // Create service instance (memoized)
  const service = useMemo(
    () => new TranslationService({ modelName: translationModel, ollamaHost }),
    [translationModel, ollamaHost]
  )

  // A host/model change or an unmount retires whatever is still in flight.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [service])

  const translate = useCallback(async (text?: string, options?: { skipCache?: boolean }) => {
    const textToProcess = text || inputText
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId && !controller.signal.aborted

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
        for await (const chunk of service.translateStream(
          textToProcess,
          detectedSource,
          targetLang,
          controller.signal
        )) {
          if (!isCurrent()) return
          result = chunk
          setOutputText(result)
        }
      } else {
        const response = await service.translate(
          textToProcess,
          detectedSource,
          targetLang,
          controller.signal
        )
        if (!isCurrent()) return
        result = response.translated
        setOutputText(result)
      }

      // Only the current request may publish its result
      if (!isCurrent()) return

      // Cache result
      translationCache.set(cacheKey, result)

      setLoading(false)
      return result
    } catch (err) {
      if (!isCurrent()) return
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
      requestIdRef.current += 1
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
