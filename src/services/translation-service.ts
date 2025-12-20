import { TranslationResult, ServiceOptions } from '../types'
import { ollamaClient } from '../lib/ollama-client'
import { buildTranslationPrompt } from '../lib/prompt-builder'
import { getModelType, cleanModelOutput } from '../lib/model'
import { detectLanguage } from '../lib/language'

export class TranslationService {
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

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslationResult> {
    const detectedSource = sourceLang === 'auto' ? detectLanguage(text) : sourceLang
    const prompt = buildTranslationPrompt(text, detectedSource, targetLang, this.modelName)

    const response = await ollamaClient.generateFromPrompt(prompt, this.modelName)
    const modelType = getModelType(this.modelName)
    const translated = cleanModelOutput(response, modelType)

    return {
      original: text,
      translated,
      sourceLang: detectedSource,
      targetLang
    }
  }

  async *translateStream(
    text: string,
    sourceLang: string,
    targetLang: string
  ): AsyncGenerator<string> {
    const detectedSource = sourceLang === 'auto' ? detectLanguage(text) : sourceLang
    const prompt = buildTranslationPrompt(text, detectedSource, targetLang, this.modelName)
    const modelType = getModelType(this.modelName)

    let accumulated = ''
    for await (const chunk of ollamaClient.streamFromPrompt(prompt, this.modelName)) {
      accumulated += chunk
      yield cleanModelOutput(accumulated, modelType)
    }
  }

  // === Utilities ===

  detectSourceLanguage(text: string): string {
    return detectLanguage(text)
  }
}

// Factory function for easy instantiation
export function createTranslationService(modelName: string, ollamaHost?: string): TranslationService {
  return new TranslationService({ modelName, ollamaHost })
}
