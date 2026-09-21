import { useCallback, useRef } from 'react'
import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'
import { detectLanguage } from '../lib/language'
import { cleanModelOutput } from '../lib/model'
import { getCorrectionPrompt, getChangesExtractionPrompt } from '../lib/prompts'
import { translationCache, createCorrectionKey } from '../lib/cache'

interface Change {
  from: string
  to: string
  reason: string
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
    setThinkingText,
    setThinking,
    setRunStartedAt,
    setLastRunMs,
  } = useAppStore()

  const { correctionModel, reasoningModel, ollamaHost, useStreaming, explanationLang, reasoningMode } =
    useSettingsStore()
  const abortRef = useRef<AbortController | null>(null)
  const changesAbortRef = useRef<AbortController | null>(null)

  // Create fallback change when JSON parsing fails
  const createFallbackChange = useCallback((original: string, corrected: string): Change[] => {
    if (original.trim() !== corrected.trim()) {
      return [{
        from: original.trim(),
        to: corrected.trim(),
        reason: 'Text was corrected/improved'
      }]
    }
    return []
  }, [])

  // Extract changes in background with robust fallback
  const extractChangesFromModel = useCallback((
    original: string,
    corrected: string,
    textLang: string,
    explainLang: string
  ) => {
    // Cancel any ongoing changes extraction
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
    }
    changesAbortRef.current = new AbortController()
    const currentAbort = changesAbortRef.current

    console.log('[Changes] Extracting changes...')
    setChangesLoading(true)
    const changesPrompt = getChangesExtractionPrompt(original, corrected, textLang, explainLang)

    ollamaClient.setBaseUrl(ollamaHost)
    ollamaClient.generate({
      model: correctionModel,
      prompt: changesPrompt,
      options: {
        temperature: 0.1,
        num_ctx: 2048,
      },
    }, currentAbort.signal).then(response => {
      // Check if aborted
      if (currentAbort.signal.aborted) {
        console.log('[Changes] Extraction aborted')
        return
      }
      console.log('[Changes] Raw response:', response)

      // Clean the response first
      const cleaned = response
        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>assistant\n?/g, '')
        .trim()

      // Try to match JSON array
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        let jsonStr = jsonMatch[0]

        // Try to fix common JSON issues (missing closing brackets)
        if (!jsonStr.endsWith(']')) {
          jsonStr = jsonStr + ']'
        }
        // Fix missing closing brace before ]
        if (jsonStr.match(/[^}\]]\s*\]$/)) {
          jsonStr = jsonStr.replace(/\]$/, '}]')
        }

        try {
          const parsed = JSON.parse(jsonStr)
          console.log('[Changes] Parsed JSON:', parsed)

          if (Array.isArray(parsed) && parsed.length > 0) {
            // Validate each change object
            const validChanges = parsed.filter((c: unknown) =>
              c && typeof c === 'object' &&
              'from' in c && 'to' in c &&
              typeof (c as Record<string, unknown>).from === 'string' &&
              typeof (c as Record<string, unknown>).to === 'string'
            ).map((c: Record<string, unknown>) => ({
              from: String(c.from),
              to: String(c.to),
              reason: c.reason ? String(c.reason) : ''
            }))

            if (validChanges.length > 0) {
              console.log('[Changes] Setting valid changes:', validChanges)
              setChanges(validChanges)
              setChangesLoading(false)
              return
            }
          }
        } catch (parseErr) {
          console.error('[Changes] JSON parse error:', parseErr)
        }
      }

      // Check if aborted before fallback
      if (currentAbort.signal.aborted) {
        console.log('[Changes] Extraction aborted before fallback')
        return
      }

      // Fallback: show simple diff
      console.log('[Changes] Using fallback diff')
      const fallback = createFallbackChange(original, corrected)
      if (fallback.length > 0) {
        setChanges(fallback)
      }
      setChangesLoading(false)
    }).catch(err => {
      // Check if aborted
      if (currentAbort.signal.aborted) {
        console.log('[Changes] Extraction aborted (in catch)')
        return
      }
      console.error('[Changes] Extraction failed:', err)
      // Even on error, show the diff as fallback
      const fallback = createFallbackChange(original, corrected)
      if (fallback.length > 0) {
        setChanges(fallback)
      }
      setChangesLoading(false)
    })
  }, [correctionModel, ollamaHost, setChanges, setChangesLoading, createFallbackChange])

  const correct = useCallback(async (
    text?: string,
    level?: CorrectionLevel,
    options?: { skipCache?: boolean }
  ) => {
    const textToProcess = text || inputText
    const levelToUse = level || correctionLevel
    const skipCache = options?.skipCache ?? false

    if (!textToProcess.trim()) return

    // Cancel any ongoing request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    // Cancel any ongoing changes extraction
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
    }
    setChangesLoading(false)

    setLoading(true)
    setError(null)
    setOutputText('')
    setChanges([])
    setThinkingText('')
    setThinking(false)
    // A reasoning run can take a minute, so the elapsed time is tracked from the
    // moment the user asks rather than only reported at the end.
    const startedAt = Date.now()
    setRunStartedAt(startedAt)
    setLastRunMs(null)

    try {
      ollamaClient.setBaseUrl(ollamaHost)

      // ALWAYS auto-detect language from input text
      const detectedLang = detectLanguage(textToProcess)
      console.log('[Correction] Detected language:', detectedLang)

      // Explanation language: use setting or fallback to detected
      const explainLang = explanationLang === 'auto' ? detectedLang : explanationLang
      console.log('[Correction] Explanation language:', explainLang)

      // Check cache (skip if regenerating)
      // Key on the model this run will actually use, so switching the reasoning
      // model does not serve results produced by the previous one.
      const keyModel =
        reasoningMode === 'thinking' && levelToUse !== 'fix' ? reasoningModel : correctionModel
      const effectiveMode = levelToUse === 'fix' ? 'instant' : reasoningMode
      const cacheKey = createCorrectionKey(textToProcess, detectedLang, levelToUse, keyModel, effectiveMode)
      if (!skipCache) {
        const cached = translationCache.get(cacheKey)
        if (cached) {
          setOutputText(cached)
          setLastRunMs(Date.now() - startedAt)
          setRunStartedAt(null)
          setLoading(false)
          // Extract changes in background
          if (cached !== textToProcess) {
            extractChangesFromModel(textToProcess, cached, detectedLang, explainLang)
          }
          return cached
        }
      }

      // Generate correction with the OLD working prompt format
      const prompt = getCorrectionPrompt(textToProcess, detectedLang, levelToUse)
      console.log('[Correction] Using prompt for', detectedLang, 'level:', levelToUse)

      // Two separate hazards decide this flag.
      //
      // Sending think to a model without the capability fails the whole request
      // ("<model> does not support thinking"), so the mode is only honoured once
      // the model confirms it.
      //
      // Sending think:false is worse than omitting it on a hybrid reasoner such
      // as qwen3: the model reasons either way, and false only turns off the
      // separate thinking channel, so the chain of thought lands in the answer
      // wrapped in <think> tags. Measured on qwen3:4b, think:false returned 7606
      // characters of reasoning as the correction where omitting it returned 706
      // clean ones. Instant therefore omits the flag rather than disabling it.
      // Reasoning is not offered for 'fix'. Measured on qwen3:4b, every one of
      // four runs answered with an explanation of the errors - once with 2749
      // characters discussing the prompt's own rules - instead of the corrected
      // sentence, and restating the output contract only fixed half of them.
      // Improve and rewrite comply reliably, and a mechanical spelling and
      // grammar pass gains little from deliberation anyway.
      const levelSupportsThinking = levelToUse !== 'fix'
      const wantsThinking =
        reasoningMode === 'thinking' &&
        levelSupportsThinking &&
        (await ollamaClient.supportsThinking(reasoningModel))
      if (reasoningMode === 'thinking' && !wantsThinking) {
        console.warn(
          levelSupportsThinking
            ? `[Correction] ${reasoningModel} cannot think; running instant`
            : `[Correction] reasoning is not used for '${levelToUse}'; running instant`
        )
      }
      const think = wantsThinking ? true : undefined
      const activeModel = wantsThinking ? reasoningModel : correctionModel
      setThinking(wantsThinking)

      let thinkingBuffer = ''
      const onThinking = (chunk: string) => {
        thinkingBuffer += chunk
        setThinkingText(thinkingBuffer)
      }

      let result = ''
      if (useStreaming) {
        for await (const chunk of ollamaClient.generateStream({
          model: activeModel,
          prompt,
          think,
          options: {
            temperature: 0.3,
            num_ctx: 2048,
          },
        }, signal, wantsThinking ? onThinking : undefined)) {
          result += chunk
          const cleaned = cleanModelOutput(result)
          setOutputText(cleaned)
        }
        result = cleanModelOutput(result)
      } else {
        const response = await ollamaClient.generate({
          model: activeModel,
          prompt,
          think,
          options: {
            temperature: 0.3,
            num_ctx: 2048,
          },
        }, signal)
        result = cleanModelOutput(response)
        setOutputText(result)
      }

      setThinking(false)

      // Cache result
      translationCache.set(cacheKey, result)

      // Extract changes if text was modified (async, non-blocking)
      if (result.trim() !== textToProcess.trim()) {
        console.log('[Changes] Text was modified, extracting changes...')
        extractChangesFromModel(textToProcess, result, detectedLang, explainLang)
      } else {
        console.log('[Changes] No changes detected (result === input)')
      }

      setLastRunMs(Date.now() - startedAt)
      setRunStartedAt(null)
      setLoading(false)
      return result
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      const errorMsg = err instanceof Error ? err.message : 'Correction failed'
      setError(errorMsg)
      setRunStartedAt(null)
      setLoading(false)
      throw err
    }
  }, [
    inputText,
    correctionLevel,
    correctionModel,
    ollamaHost,
    useStreaming,
    explanationLang,
    reasoningMode,
    reasoningModel,
    setOutputText,
    setThinkingText,
    setThinking,
    setRunStartedAt,
    setLastRunMs,
    setLoading,
    setError,
    setChanges,
    extractChangesFromModel,
  ])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    // The background changes pass outlives the correction request, so it has to
    // be stopped too or it would keep streaming into a cancelled result.
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
      changesAbortRef.current = null
    }
    setLoading(false)
    setChangesLoading(false)
    setThinking(false)
    setRunStartedAt(null)
  }, [setLoading, setChangesLoading, setThinking, setRunStartedAt])

  const setLevel = useCallback((level: CorrectionLevel) => {
    setCorrectionLevel(level)
  }, [setCorrectionLevel])

  return {
    correct,
    setLevel,
    cancel,
  }
}
