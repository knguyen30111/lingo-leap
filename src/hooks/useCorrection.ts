import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { GrammarService } from '../services/grammar-service'
import { translationCache, createCorrectionKey } from '../lib/cache'

/**
 * One correction attempt plus the background extraction it starts. Anything
 * asynchronous must re-check `isCurrent` before touching state or the cache.
 */
interface RequestContext {
  signal: AbortSignal
  isCurrent: () => boolean
}

export function useCorrection() {
  const {
    inputText,
    setOutputText,
    correctionLevel,
    setCorrectionLevel,
    setLoading,
    setError,
    setChanges,
    setChangesLoading,
  } = useAppStore()

  const { correctionModel, ollamaHost, useStreaming, explanationLang } = useSettingsStore()

  // One task service per configured model and host; it never changes endpoint
  // mid-flight, and it owns every prompt, transport, and parsing decision.
  const service = useMemo(
    () => new GrammarService({ modelName: correctionModel, ollamaHost }),
    [correctionModel, ollamaHost]
  )
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  // Retire whatever is still in flight so it can no longer publish anything.
  const retireInFlight = useCallback(() => {
    if (!abortRef.current) return
    requestIdRef.current += 1
    abortRef.current.abort()
    abortRef.current = null
    setLoading(false)
    setChangesLoading(false)
  }, [setLoading, setChangesLoading])

  // Any setting a request captured — host, model, explanation language — or an
  // unmount retires that request and its background change extraction.
  useEffect(() => {
    return retireInFlight
  }, [service, explanationLang, retireInFlight])

  // Explanations are never awaited by `correct`: they publish later, and only
  // while the request that started them is still the current one.
  const extractChangesInBackground = useCallback((
    original: string,
    corrected: string,
    textLang: string,
    explainLang: string,
    request: RequestContext
  ) => {
    if (!request.isCurrent()) return

    setChangesLoading(true)

    service.extractChanges(original, corrected, textLang, explainLang, request.signal)
      .then(changes => {
        if (!request.isCurrent()) return
        if (changes.length > 0) {
          setChanges(changes)
        }
        setChangesLoading(false)
      })
      .catch(err => {
        // The service answers an ordinary failure with its own fallback, so
        // anything reaching here is a retired or cancelled request.
        if (!request.isCurrent()) return
        console.error('[Changes] Extraction failed:', err)
        setChangesLoading(false)
      })
  }, [service, setChanges, setChangesLoading])

  const correct = useCallback(async (
    text?: string,
    level?: CorrectionLevel,
    options?: { skipCache?: boolean }
  ) => {
    const textToProcess = text || inputText
    const levelToUse = level || correctionLevel
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request, including its background change extraction
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const request: RequestContext = {
      signal: controller.signal,
      isCurrent: () => requestIdRef.current === requestId && !controller.signal.aborted,
    }

    setChangesLoading(false)

    setLoading(true)
    setError(null)
    setOutputText('')
    setChanges([])

    try {
      // ALWAYS auto-detect language from input text
      const detectedLang = service.detectSourceLanguage(textToProcess)

      // Explanation language: use setting or fallback to detected
      const explainLang = explanationLang === 'auto' ? detectedLang : explanationLang

      // Check cache (skip if regenerating)
      const cacheKey = createCorrectionKey(textToProcess, detectedLang, levelToUse, correctionModel)
      if (!skipCache) {
        const cached = translationCache.get(cacheKey)
        if (cached) {
          setOutputText(cached)
          setLoading(false)
          // Extract changes in background
          if (cached !== textToProcess) {
            extractChangesInBackground(textToProcess, cached, detectedLang, explainLang, request)
          }
          return cached
        }
      }

      let result = ''
      if (useStreaming) {
        for await (const chunk of service.correctTextStream(
          textToProcess,
          detectedLang,
          levelToUse,
          request.signal
        )) {
          if (!request.isCurrent()) return
          result = chunk
          setOutputText(result)
        }
      } else {
        result = await service.correctText(
          textToProcess,
          detectedLang,
          levelToUse,
          request.signal
        )
        if (!request.isCurrent()) return
        setOutputText(result)
      }

      // Only the current request may publish its result
      if (!request.isCurrent()) return

      // Cache result
      translationCache.set(cacheKey, result)

      // Extract changes if text was modified (async, non-blocking)
      if (result.trim() !== textToProcess.trim()) {
        extractChangesInBackground(textToProcess, result, detectedLang, explainLang, request)
      }

      setLoading(false)
      return result
    } catch (err) {
      if (!request.isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const errorMsg = err instanceof Error ? err.message : 'Correction failed'
      setError(errorMsg)
      setLoading(false)
      throw err
    }
  }, [
    inputText,
    correctionLevel,
    correctionModel,
    service,
    useStreaming,
    explanationLang,
    setOutputText,
    setLoading,
    setError,
    setChanges,
    setChangesLoading,
    extractChangesInBackground,
  ])

  const cancel = useCallback(() => {
    retireInFlight()
  }, [retireInFlight])

  const setLevel = useCallback((level: CorrectionLevel) => {
    setCorrectionLevel(level)
  }, [setCorrectionLevel])

  return {
    correct,
    setLevel,
    cancel,
  }
}
