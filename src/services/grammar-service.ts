import {
  CorrectionLevel,
  CorrectionResult,
  Change,
  ServiceOptions
} from '../types'
import { ollamaClient } from '../lib/ollama-client'
import { buildCorrectionPrompt, buildChangesExtractionPrompt } from '../lib/prompt-builder'
import { getModelType, cleanModelOutput } from '../lib/model'
import { detectLanguage } from '../lib/language'

export class GrammarService {
  private modelName: string
  private ollamaHost: string

  constructor(options: ServiceOptions) {
    this.modelName = options.modelName
    this.ollamaHost = options.ollamaHost || 'http://localhost:11434'
    ollamaClient.setBaseUrl(this.ollamaHost)
  }

  // === Configuration ===

  setModel(modelName: string): void {
    this.modelName = modelName
  }

  setHost(host: string): void {
    this.ollamaHost = host
    ollamaClient.setBaseUrl(host)
  }

  // === Core Methods ===

  async correctText(
    text: string,
    language: string,
    level: CorrectionLevel
  ): Promise<string> {
    const detectedLang = language === 'auto' ? detectLanguage(text) : language
    const prompt = buildCorrectionPrompt(text, detectedLang, level, this.modelName)

    const response = await ollamaClient.generateFromPrompt(prompt, this.modelName)
    const modelType = getModelType(this.modelName)

    return cleanModelOutput(response, modelType)
  }

  async *correctTextStream(
    text: string,
    language: string,
    level: CorrectionLevel
  ): AsyncGenerator<string> {
    const detectedLang = language === 'auto' ? detectLanguage(text) : language
    const prompt = buildCorrectionPrompt(text, detectedLang, level, this.modelName)
    const modelType = getModelType(this.modelName)

    let accumulated = ''
    for await (const chunk of ollamaClient.streamFromPrompt(prompt, this.modelName)) {
      accumulated += chunk
      yield cleanModelOutput(accumulated, modelType)
    }
  }

  async extractChanges(
    original: string,
    corrected: string,
    textLanguage: string,
    explanationLanguage: string
  ): Promise<Change[]> {
    // No changes if text is identical
    if (original.trim() === corrected.trim()) {
      console.log('[GrammarService] No changes - text identical')
      return []
    }

    const prompt = buildChangesExtractionPrompt(
      original,
      corrected,
      textLanguage,
      explanationLanguage,
      this.modelName
    )

    console.log('[GrammarService] Extracting changes with prompt:', prompt)

    try {
      const changes = await ollamaClient.generateJSON<Change[]>(prompt, this.modelName)
      console.log('[GrammarService] Raw changes:', changes)

      // Validate and filter changes
      const filtered = changes.filter(c =>
        c && typeof c.from === 'string' && typeof c.to === 'string'
      ).map(c => ({
        from: c.from,
        to: c.to,
        reason: c.reason || ''
      }))

      console.log('[GrammarService] Filtered changes:', filtered)
      return filtered
    } catch (err) {
      console.error('[GrammarService] Failed to extract changes:', err)

      // Fallback: return whole text as single change
      return [{
        from: original.trim(),
        to: corrected.trim(),
        reason: 'Text was corrected'
      }]
    }
  }

  async correctAndExplain(
    text: string,
    textLanguage: string,
    explanationLanguage: string,
    level: CorrectionLevel
  ): Promise<CorrectionResult> {
    const detectedLang = textLanguage === 'auto' ? detectLanguage(text) : textLanguage
    const explainLang = explanationLanguage === 'auto' ? detectedLang : explanationLanguage

    // Step 1: Correct text
    const corrected = await this.correctText(text, detectedLang, level)

    // Step 2: Extract changes (async, can be done in parallel in UI)
    const changes = await this.extractChanges(text, corrected, detectedLang, explainLang)

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
