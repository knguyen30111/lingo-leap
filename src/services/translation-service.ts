import { AiProvider, TranslationResult, ServiceOptions } from '../types'
import { OllamaClient } from '../lib/ollama-client'
import { buildTranslationPrompt } from '../lib/prompt-builder'
import { getModelType, cleanModelOutput } from '../lib/model'
import { detectLanguage } from '../lib/language'

export class TranslationService {
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

  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
    signal?: AbortSignal
  ): Promise<TranslationResult> {
    const detectedSource = sourceLang === 'auto' ? detectLanguage(text) : sourceLang
    const prompt = buildTranslationPrompt(text, detectedSource, targetLang, this.modelName)

    const response = await this.provider.generateFromPrompt(prompt, this.modelName, {}, signal)
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
    targetLang: string,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const detectedSource = sourceLang === 'auto' ? detectLanguage(text) : sourceLang
    const prompt = buildTranslationPrompt(text, detectedSource, targetLang, this.modelName)
    const modelType = getModelType(this.modelName)

    let accumulated = ''
    for await (const chunk of this.provider.streamFromPrompt(prompt, this.modelName, {}, signal)) {
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
