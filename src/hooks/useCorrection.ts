import { useCallback, useRef } from 'react'
import { useAppStore, CorrectionLevel } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'
import { detectLanguage } from '../lib/language'
import { getCorrectionPrompt, getChangesExtractionPrompt } from '../lib/prompts'
import { translationCache, createCorrectionKey } from '../lib/cache'

interface Change {
  from: string
  to: string
  reason: string
}

// Clean model output artifacts
function cleanModelOutput(text: string): string {
  return text
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|end\|>/g, '')
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|im_start\|>assistant\n?/g, '')
    .trim()
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
    }).then(response => {
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

    // Cancel any ongoing changes extraction
    if (changesAbortRef.current) {
      changesAbortRef.current.abort()
    }
    setChangesLoading(false)

    setLoading(true)
    setError(null)
    setOutputText('')
    setChanges([])

    try {
      ollamaClient.setBaseUrl(ollamaHost)

      // ALWAYS auto-detect language from input text
      const detectedLang = detectLanguage(textToProcess)
      console.log('[Correction] Detected language:', detectedLang)

      // Explanation language: use setting or fallback to detected
      const explainLang = explanationLang === 'auto' ? detectedLang : explanationLang
      console.log('[Correction] Explanation language:', explainLang)

      // Check cache (skip if regenerating)
      const cacheKey = createCorrectionKey(textToProcess, detectedLang, levelToUse, correctionModel)
      if (!skipCache) {
        const cached = translationCache.get(cacheKey)
        if (cached) {
          setOutputText(cached)
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

      let result = ''
      if (useStreaming) {
        for await (const chunk of ollamaClient.generateStream({
          model: correctionModel,
          prompt,
          options: {
            temperature: 0.3,
            num_ctx: 2048,
          },
        })) {
          result += chunk
          const cleaned = cleanModelOutput(result)
          setOutputText(cleaned)
        }
        result = cleanModelOutput(result)
      } else {
        const response = await ollamaClient.generate({
          model: correctionModel,
          prompt,
          options: {
            temperature: 0.3,
            num_ctx: 2048,
          },
        })
        result = cleanModelOutput(response)
        setOutputText(result)
      }

      // Cache result
      translationCache.set(cacheKey, result)

      // Extract changes if text was modified (async, non-blocking)
      if (result.trim() !== textToProcess.trim()) {
        console.log('[Changes] Text was modified, extracting changes...')
        extractChangesFromModel(textToProcess, result, detectedLang, explainLang)
      } else {
        console.log('[Changes] No changes detected (result === input)')
      }

      setLoading(false)
      return result
    } catch (err) {
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
    ollamaHost,
    useStreaming,
    explanationLang,
    setOutputText,
    setLoading,
    setError,
    setChanges,
    extractChangesFromModel,
  ])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
      setLoading(false)
    }
  }, [setLoading])

  const setLevel = useCallback((level: CorrectionLevel) => {
    setCorrectionLevel(level)
  }, [setCorrectionLevel])

  return {
    correct,
    setLevel,
    cancel,
  }
}
