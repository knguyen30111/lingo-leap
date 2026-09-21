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

// How much the model is allowed to deliberate before answering.
// 'instant' is a plain generation; 'thinking' asks Ollama for a reasoning pass
// first, which only models advertising the "thinking" capability can serve.
export type ReasoningMode = 'instant' | 'thinking'

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
  // Ollama rejects this outright on a model without the capability
  // ("<model> does not support thinking"), so it must only be sent after
  // checking supportsThinking().
  think?: boolean
  options?: {
    temperature?: number
    num_ctx?: number
    num_predict?: number
  }
}

export interface OllamaGenerateResponse {
  model: string
  response: string
  // Present only when think was requested; carries the reasoning pass, which
  // Ollama keeps separate from the answer.
  thinking?: string
  done: boolean
  total_duration?: number
  eval_count?: number
}

export interface OllamaShowResponse {
  capabilities?: string[]
}

export interface OllamaModelInfo {
  name: string
  modified_at: string
  size: number
}
