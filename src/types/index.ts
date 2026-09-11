// === Model Types ===
export type ModelType = 'qwen' | 'aya' | 'llama' | 'gemma'

export interface ModelFormat {
  systemStart: string
  systemEnd: string
  userStart: string
  userEnd: string
  assistantStart: string
}

// === Prompt Types ===
export interface PromptResult {
  prompt: string
  system?: string  // For models using Ollama's system param
}

// === Correction Types ===
export type CorrectionLevel = 'fix' | 'improve' | 'rewrite'

export interface Change {
  from: string
  to: string
  reason: string
}

export interface CorrectionResult {
  original: string
  corrected: string
  changes: Change[]
  language: string
}

// === Translation Types ===
export interface TranslationResult {
  original: string
  translated: string
  sourceLang: string
  targetLang: string
}

// === Service Options ===
export interface ServiceOptions {
  modelName: string
  ollamaHost?: string
  temperature?: number
  streaming?: boolean
  provider?: AiProvider
}

// === Ollama Types ===
export interface OllamaGenerateRequest {
  model: string
  prompt: string
  system?: string
  stream?: boolean
  options?: {
    temperature?: number
    num_ctx?: number
    num_predict?: number
  }
}

export interface OllamaGenerateResponse {
  model: string
  response: string
  done: boolean
  total_duration?: number
  eval_count?: number
}

export interface OllamaModelInfo {
  name: string
  modified_at: string
  size: number
}

// === Provider Contract ===
export interface GenerateOptions {
  temperature?: number
  num_ctx?: number
}

/**
 * The typed seam every local AI transport implements. Each network-capable
 * method accepts an optional caller signal so a cancelled request stops at the
 * transport instead of racing a newer one.
 */
export interface AiProvider {
  checkHealth(signal?: AbortSignal): Promise<boolean>
  listModels(signal?: AbortSignal): Promise<OllamaModelInfo[]>
  generate(request: OllamaGenerateRequest, signal?: AbortSignal): Promise<string>
  generateStream(request: OllamaGenerateRequest, signal?: AbortSignal): AsyncGenerator<string>
  generateFromPrompt(
    promptResult: PromptResult,
    modelName: string,
    options?: GenerateOptions,
    signal?: AbortSignal
  ): Promise<string>
  streamFromPrompt(
    promptResult: PromptResult,
    modelName: string,
    options?: GenerateOptions,
    signal?: AbortSignal
  ): AsyncGenerator<string>
  generateJSON<T>(
    promptResult: PromptResult,
    modelName: string,
    maxRetries?: number,
    signal?: AbortSignal
  ): Promise<T>
}
