import {
  AiProvider,
  CorrectionLevel,
  CorrectionResult,
  Change,
  ServiceOptions
} from '../types'
import { OllamaClient } from '../lib/ollama-client'
import { buildCorrectionPrompt, buildChangesExtractionPrompt } from '../lib/prompt-builder'
import { getModelType, cleanModelOutput } from '../lib/model'
import { detectLanguage } from '../lib/language'

// A cancelled extraction is not an extraction failure: it must reach the caller
// instead of being answered with the whole-text fallback.
function isAbortFailure(err: unknown, signal?: AbortSignal): boolean {
  return (err instanceof Error && err.name === 'AbortError') || signal?.aborted === true
}

// Shown verbatim in the changes panel whenever the model cannot describe what it
// changed, so the wording is part of the user-visible contract.
const FALLBACK_CHANGE_REASON = 'Text was corrected/improved'

// Unusable JSON is answered with the whole-text fallback, so retrying the model
// only multiplies the wait for the same panel content.
const EXTRACTION_JSON_RETRIES = 0

function wholeTextFallback(original: string, corrected: string): Change[] {
  return [{
    from: original.trim(),
    to: corrected.trim(),
    reason: FALLBACK_CHANGE_REASON
  }]
}

export class GrammarService {
  private modelName: string
  private provider: AiProvider

  constructor(options: ServiceOptions) {
    this.modelName = options.modelName
    this.provider = options.provider ?? new OllamaClient(options.ollamaHost || 'http://localhost:11434')
  }

  // === Configuration ===

  setModel(modelName: string): void {
    this.modelName = modelName
  }

  setHost(host: string): void {
    this.provider = new OllamaClient(host)
  }

  // === Core Methods ===

  async correctText(
    text: string,
    language: string,
    level: CorrectionLevel,
    signal?: AbortSignal
  ): Promise<string> {
    const detectedLang = language === 'auto' ? detectLanguage(text) : language
    const prompt = buildCorrectionPrompt(text, detectedLang, level, this.modelName)

    const response = await this.provider.generateFromPrompt(prompt, this.modelName, {}, signal)
    const modelType = getModelType(this.modelName)

    return cleanModelOutput(response, modelType)
  }

  async *correctTextStream(
    text: string,
    language: string,
    level: CorrectionLevel,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const detectedLang = language === 'auto' ? detectLanguage(text) : language
    const prompt = buildCorrectionPrompt(text, detectedLang, level, this.modelName)
    const modelType = getModelType(this.modelName)

    let accumulated = ''
    for await (const chunk of this.provider.streamFromPrompt(prompt, this.modelName, {}, signal)) {
      accumulated += chunk
      yield cleanModelOutput(accumulated, modelType)
    }
  }

  async extractChanges(
    original: string,
    corrected: string,
    textLanguage: string,
    explanationLanguage: string,
    signal?: AbortSignal
  ): Promise<Change[]> {
    // No changes if text is identical
    if (original.trim() === corrected.trim()) {
      return []
    }

    const prompt = buildChangesExtractionPrompt(
      original,
      corrected,
      textLanguage,
      explanationLanguage,
      this.modelName
    )

    try {
      const changes = await this.provider.generateJSON<Change[]>(
        prompt,
        this.modelName,
        EXTRACTION_JSON_RETRIES,
        signal
      )
      // Validate and filter changes
      const filtered = changes.filter(c =>
        c && typeof c.from === 'string' && typeof c.to === 'string'
      ).map(c => ({
        from: c.from,
        to: c.to,
        reason: c.reason || ''
      }))

      // An answer that describes no change is as unusable as a failed one.
      return filtered.length > 0 ? filtered : wholeTextFallback(original, corrected)
    } catch (err) {
      if (isAbortFailure(err, signal)) throw err

      // Content-free by contract: an extraction failure is a JSON.parse error
      // whose message quotes the model output it choked on.
      console.error('[GrammarService] Failed to extract changes')

      return wholeTextFallback(original, corrected)
    }
  }

  // === Utilities ===

  detectSourceLanguage(text: string): string {
    return detectLanguage(text)
  }

  async correctAndExplain(
    text: string,
    textLanguage: string,
    explanationLanguage: string,
    level: CorrectionLevel,
    signal?: AbortSignal
  ): Promise<CorrectionResult> {
    const detectedLang = textLanguage === 'auto' ? detectLanguage(text) : textLanguage
    const explainLang = explanationLanguage === 'auto' ? detectedLang : explanationLanguage

    // Step 1: Correct text
    const corrected = await this.correctText(text, detectedLang, level, signal)

    // Step 2: Extract changes (async, can be done in parallel in UI)
    const changes = await this.extractChanges(text, corrected, detectedLang, explainLang, signal)

    return {
      original: text,
      corrected,
      changes,
      language: detectedLang
    }
  }
}

// Factory function for easy instantiation
export function createGrammarService(modelName: string, ollamaHost?: string): GrammarService {
  return new GrammarService({ modelName, ollamaHost })
}
