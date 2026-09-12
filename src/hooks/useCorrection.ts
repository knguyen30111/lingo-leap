import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { GrammarService } from '../services/grammar-service'
import { correctionResultCache, createCorrectionCacheKey } from '../lib/cache'

/**
 * One correction attempt plus the background extraction it starts. Anything
 * asynchronous must re-check `isCurrent` before touching state or the cache.
 */
interface RequestContext {
  signal: AbortSignal
  isCurrent: () => boolean
}

/** The request that currently owns the output, the cache write, and loading. */
interface ActiveRequest {
  id: number
  controller: AbortController
}

export function useCorrection() {
  const {
    setOutputText,
    setCorrectionLevel,
    setLatestDetectedSourceLang,
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
  const activeRef = useRef<ActiveRequest | null>(null)
  const requestIdRef = useRef(0)

  // Retire whatever is still in flight so it can no longer publish anything.
  // The snapshot keeps a request that starts later in this same tick alive.
  const retireInFlight = useCallback(() => {
    const retired = activeRef.current
    if (!retired) return
    requestIdRef.current += 1
    retired.controller.abort()
    if (activeRef.current === retired) {
      activeRef.current = null
      setLoading(false)
      setChangesLoading(false)
    }
  }, [setLoading, setChangesLoading])

  // Any setting a request captured — host, model, explanation language,
  // streaming — or an unmount retires that request and its background change
  // extraction.
  useEffect(() => {
    return retireInFlight
  }, [service, explanationLang, useStreaming, retireInFlight])

  // A later edit to any selection the request captured retires it before the
  // mutating setter returns, so no stale correction can answer new input.
  useEffect(() => {
    return useAppStore.subscribe((next, prev) => {
      const inputChanged =
        next.inputText !== prev.inputText || next.mode !== prev.mode
      if (!inputChanged && next.correctionLevel === prev.correctionLevel) return

      // A detected language describes the text it was detected from.
      if (inputChanged && next.latestDetectedSourceLang !== null) {
        setLatestDetectedSourceLang(null)
      }
      retireInFlight()
    })
  }, [retireInFlight, setLatestDetectedSourceLang])

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
      .catch(() => {
        // The service answers an ordinary failure with its own fallback, so
        // anything reaching here is a retired or cancelled request.
        if (!request.isCurrent()) return
        console.error('[Changes] Extraction failed')
        setChangesLoading(false)
      })
  }, [service, setChanges, setChangesLoading])

  const correct = useCallback(async (
    text?: string,
    level?: CorrectionLevel,
    options?: { skipCache?: boolean }
  ) => {
    const { inputText, correctionLevel } = useAppStore.getState()
    const textToProcess = text || inputText
    const levelToUse = level || correctionLevel
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request, including its background change extraction
    retireInFlight()

    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const active: ActiveRequest = { id: requestId, controller }
    activeRef.current = active
    const request: RequestContext = {
      signal: controller.signal,
      isCurrent: () => requestIdRef.current === requestId && !controller.signal.aborted,
    }
    // Only the request that still owns loading may settle it. The request
    // keeps its controller so a later retirement still reaches the background
    // extraction it started.
    const settle = () => {
      if (activeRef.current === active) {
        setLoading(false)
      }
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
      const cacheKey = await createCorrectionCacheKey({
        endpoint: ollamaHost,
        model: correctionModel,
        language: detectedLang,
        level: levelToUse,
        input: textToProcess,
      })

      // Digesting the key is asynchronous, so a request can be retired while
      // it runs and must not reach the cache, the service, or the background
      // extraction afterwards.
      if (!request.isCurrent()) return

      if (!skipCache) {
        const cached = correctionResultCache.get(cacheKey)
        if (cached) {
          if (!request.isCurrent()) return
          setOutputText(cached)
          setLatestDetectedSourceLang(detectedLang)
          settle()
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
      correctionResultCache.set(cacheKey, result)
      setLatestDetectedSourceLang(detectedLang)

      // Extract changes if text was modified (async, non-blocking)
      if (result.trim() !== textToProcess.trim()) {
        extractChangesInBackground(textToProcess, result, detectedLang, explainLang, request)
      }

      settle()
      return result
    } catch (err) {
      if (!request.isCurrent()) return
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const errorMsg = err instanceof Error ? err.message : 'Correction failed'
      setError(errorMsg)
      settle()
      throw err
    }
  }, [
    correctionModel,
    ollamaHost,
    service,
    useStreaming,
    explanationLang,
    retireInFlight,
    setOutputText,
    setLatestDetectedSourceLang,
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
