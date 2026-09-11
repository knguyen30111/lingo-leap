import { useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { TranslationService } from '../services/translation-service'
import { translationCache, createTranslationKey } from '../lib/cache'

/** The request that currently owns the output, the cache write, and loading. */
interface ActiveRequest {
  id: number
  controller: AbortController
}

export function useTranslation() {
  const {
    setInputText,
    setOutputText,
    setLatestDetectedSourceLang,
    setLoading,
    setError,
  } = useAppStore()

  const { translationModel, ollamaHost, useStreaming } = useSettingsStore()
  const activeRef = useRef<ActiveRequest | null>(null)
  const requestIdRef = useRef(0)

  // Create service instance (memoized)
  const service = useMemo(
    () => new TranslationService({ modelName: translationModel, ollamaHost }),
    [translationModel, ollamaHost]
  )

  // Retire whatever is in flight so it can no longer publish anything. The
  // snapshot keeps a request that starts later in this same tick alive.
  const retireInFlight = useCallback(() => {
    const retired = activeRef.current
    if (!retired) return
    requestIdRef.current += 1
    retired.controller.abort()
    if (activeRef.current === retired) {
      activeRef.current = null
      setLoading(false)
    }
  }, [setLoading])

  // A host/model change or an unmount retires whatever is still in flight.
  useEffect(() => {
    return retireInFlight
  }, [service, retireInFlight])

  // A later edit to any selection the request captured retires it, and it must
  // happen while the mutating setter runs: `translateText` updates the input
  // first and starts its own translation immediately afterwards.
  useEffect(() => {
    return useAppStore.subscribe((next, prev) => {
      const selectionChanged =
        next.inputText !== prev.inputText ||
        next.sourceLang !== prev.sourceLang ||
        next.mode !== prev.mode
      if (!selectionChanged && next.targetLang === prev.targetLang) return

      // A detected language describes one input under one selected source.
      if (selectionChanged && next.latestDetectedSourceLang !== null) {
        setLatestDetectedSourceLang(null)
      }
      retireInFlight()
    })
  }, [retireInFlight, setLatestDetectedSourceLang])

  const translate = useCallback(async (text?: string, options?: { skipCache?: boolean }) => {
    const { inputText, sourceLang, targetLang } = useAppStore.getState()
    const textToProcess = text || inputText
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request
    retireInFlight()

    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const request: ActiveRequest = { id: requestId, controller }
    activeRef.current = request
    const isCurrent = () => requestIdRef.current === requestId && !controller.signal.aborted
    // Only the request that still owns loading may settle it.
    const settle = () => {
      if (activeRef.current === request) {
        setLoading(false)
      }
    }

    setLoading(true)
    setError(null)
    setOutputText('')

    try {
      // Detect source language if auto
      const isAutomatic = sourceLang === 'auto'
      const resolvedSourceLang = isAutomatic
        ? service.detectSourceLanguage(textToProcess)
        : sourceLang

      // A manual source answers the question the detected language answers,
      // so no earlier detection may keep describing this request.
      if (!isAutomatic) {
        setLatestDetectedSourceLang(null)
      }

      // A detected language is published with the result it belongs to.
      const publishResolvedSourceLang = () => {
        if (isAutomatic) {
          setLatestDetectedSourceLang(resolvedSourceLang)
        }
      }

      // Check cache (skip if regenerating)
      const cacheKey = createTranslationKey(textToProcess, resolvedSourceLang, targetLang, translationModel)
      if (!skipCache) {
        const cached = translationCache.get(cacheKey)
        if (cached) {
          if (!isCurrent()) return
          setOutputText(cached)
          publishResolvedSourceLang()
          settle()
          return cached
        }
      }

      let result = ''

      if (useStreaming) {
        for await (const chunk of service.translateStream(
          textToProcess,
          resolvedSourceLang,
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
          resolvedSourceLang,
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
      publishResolvedSourceLang()

      settle()
      return result
    } catch (err) {
      if (!isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') return
      const errorMsg = err instanceof Error ? err.message : 'Translation failed'
      setError(errorMsg)
      settle()
      throw err
    }
  }, [
    translationModel,
    useStreaming,
    service,
    retireInFlight,
    setOutputText,
    setLatestDetectedSourceLang,
    setLoading,
    setError,
  ])

  const cancel = useCallback(() => {
    retireInFlight()
  }, [retireInFlight])

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
