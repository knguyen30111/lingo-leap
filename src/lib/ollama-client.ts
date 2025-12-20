import { OllamaGenerateRequest, OllamaGenerateResponse, PromptResult, OllamaModelInfo } from '../types'

export class OllamaClient {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  // === Health Check ===

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  // === Model Management ===

  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return []
      const data = await response.json()
      return data.models || []
    } catch {
      return []
    }
  }

  // === Generation ===

  async generate(request: OllamaGenerateRequest): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
    }

    const data: OllamaGenerateResponse = await response.json()
    return data.response
  }

  async generateFromPrompt(
    promptResult: PromptResult,
    modelName: string,
    options: { temperature?: number; num_ctx?: number } = {}
  ): Promise<string> {
    return this.generate({
      model: modelName,
      prompt: promptResult.prompt,
      system: promptResult.system,
      options: {
        temperature: options.temperature ?? 0.3,
        num_ctx: options.num_ctx ?? 2048,
      },
    })
  }

  // === Streaming ===

  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line)
            if (data.response) yield data.response
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }
  }

  async *streamFromPrompt(
    promptResult: PromptResult,
    modelName: string,
    options: { temperature?: number; num_ctx?: number } = {}
  ): AsyncGenerator<string> {
    yield* this.generateStream({
      model: modelName,
      prompt: promptResult.prompt,
      system: promptResult.system,
      options: {
        temperature: options.temperature ?? 0.3,
        num_ctx: options.num_ctx ?? 2048,
      },
    })
  }

  // === JSON Generation with Retry ===

  async generateJSON<T>(
    promptResult: PromptResult,
    modelName: string,
    maxRetries: number = 2
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.generateFromPrompt(promptResult, modelName, {
          temperature: 0.1, // Lower for JSON consistency
        })
        return this.parseJSON<T>(response)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < maxRetries) {
          console.warn(`JSON parse retry ${attempt + 1}/${maxRetries}`)
        }
      }
    }

    throw lastError || new Error('JSON generation failed')
  }

  private parseJSON<T>(response: string): T {
    // Clean model artifacts
    let cleaned = response
      .replace(/<\|im_end\|>/g, '')
      .replace(/<\|im_start\|>assistant\n?/g, '')
      .replace(/<\|end\|>/g, '')
      .replace(/<\|assistant\|>/g, '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    // Extract JSON array/object
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    const objectMatch = cleaned.match(/\{[\s\S]*\}/)

    if (arrayMatch) cleaned = arrayMatch[0]
    else if (objectMatch) cleaned = objectMatch[0]

    return JSON.parse(cleaned)
  }

  // === Model Pull (kept for compatibility) ===

  async pullModel(modelName: string, onProgress?: (status: string) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    })

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line)
            if (onProgress && data.status) {
              onProgress(data.status)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

// Singleton instance
export const ollamaClient = new OllamaClient()
