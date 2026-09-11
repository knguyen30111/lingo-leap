import {
  AiProvider,
  GenerateOptions,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  PromptResult,
  OllamaModelInfo,
} from '../types'

const HEALTH_TIMEOUT_MS = 5000

interface StreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

function parseRecord(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/**
 * Yields every complete newline-delimited JSON record, including a final record
 * that arrives without a trailing newline.
 */
async function* readJsonRecords(reader: StreamReader): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const record = parseRecord(line)
      if (record) yield record
    }
  }

  const tail = parseRecord(buffer + decoder.decode())
  if (tail) yield tail
}

export class OllamaClient implements AiProvider {
  private readonly baseUrl: string

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  // === Health Check ===

  async checkHealth(signal?: AbortSignal): Promise<boolean> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const forwardAbort = () => controller.abort()

    if (signal?.aborted) controller.abort()
    else signal?.addEventListener('abort', forwardAbort)

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  // === Model Management ===

  async listModels(signal?: AbortSignal): Promise<OllamaModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal })
      if (!response.ok) return []
      const data = await response.json()
      return data.models || []
    } catch {
      return []
    }
  }

  // === Generation ===

  async generate(request: OllamaGenerateRequest, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
      signal,
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
    options: GenerateOptions = {},
    signal?: AbortSignal
  ): Promise<string> {
    return this.generate(
      {
        model: modelName,
        prompt: promptResult.prompt,
        system: promptResult.system,
        options: {
          temperature: options.temperature ?? 0.3,
          num_ctx: options.num_ctx ?? 2048,
        },
      },
      signal
    )
  }

  // === Streaming ===

  async *generateStream(
    request: OllamaGenerateRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    for await (const record of readJsonRecords(reader)) {
      if (record.response) yield record.response as string
    }
  }

  async *streamFromPrompt(
    promptResult: PromptResult,
    modelName: string,
    options: GenerateOptions = {},
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    yield* this.generateStream(
      {
        model: modelName,
        prompt: promptResult.prompt,
        system: promptResult.system,
        options: {
          temperature: options.temperature ?? 0.3,
          num_ctx: options.num_ctx ?? 2048,
        },
      },
      signal
    )
  }

  // === JSON Generation with Retry ===

  async generateJSON<T>(
    promptResult: PromptResult,
    modelName: string,
    maxRetries: number = 2,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.generateFromPrompt(
          promptResult,
          modelName,
          { temperature: 0.1 }, // Lower for JSON consistency
          signal
        )
        return this.parseJSON<T>(response)
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        // A cancelled request must not spend another round trip.
        if (isAbortError(lastError) || signal?.aborted) throw lastError
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

  async pullModel(
    modelName: string,
    onProgress?: (status: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) return

    for await (const record of readJsonRecords(reader)) {
      if (onProgress && record.status) {
        onProgress(record.status as string)
      }
    }
  }
}
