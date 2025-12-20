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
