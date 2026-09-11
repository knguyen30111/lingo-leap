// LRU cache and key contracts for AI results

interface CacheEntry<T> {
  value: T
  timestamp: number
}

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>
  private maxSize: number
  private ttl: number // Time to live in ms

  constructor(maxSize: number = 100, ttlMinutes: number = 30) {
    this.cache = new Map()
    this.maxSize = maxSize
    this.ttl = ttlMinutes * 60 * 1000
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  set(key: string, value: T): void {
    // Delete if exists to update position
    this.cache.delete(key)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

/** Bumped when the canonical payload shape or the digest algorithm changes. */
const AI_RESULT_CACHE_SCHEMA_VERSION = 'ai-result-cache:v1'

/** The only provider shipped today, kept explicit so a second one cannot reuse keys. */
const DEFAULT_AI_CACHE_PROVIDER = 'ollama'

/** Bump when the translation prompt or translation output semantics change. */
export const TRANSLATION_TASK_REVISION = 'translation:v1'

/** Bump when the correction prompt, levels, or output semantics change. */
export const CORRECTION_TASK_REVISION = 'correction:v1'

// One store for every AI result, so the two task contracts below share a
// single 100-entry, 30-minute budget instead of doubling it.
const aiResultCache = new LRUCache<string>(100, 30)

export const translationResultCache = aiResultCache
export const correctionResultCache = aiResultCache

export interface TranslationCacheKeyInput {
  endpoint: string
  model: string
  sourceLang: string
  targetLang: string
  input: string
  provider?: string
  schemaVersion?: string
  taskRevision?: string
}

export interface CorrectionCacheKeyInput {
  endpoint: string
  model: string
  language: string
  level: string
  input: string
  provider?: string
  schemaVersion?: string
  taskRevision?: string
}

// The digest input is written field by field in a fixed order: property
// iteration order must never decide a key, and a length prefix stops one field
// from borrowing the start of the next.
async function digestCacheKey(
  schemaVersion: string,
  task: string,
  fields: string[]
): Promise<string> {
  const payload = fields.map(field => `${field.length}:${field}`).join('|')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  const hex = Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

  // Only the digest crosses the boundary: the payload carries the user's text.
  return `${schemaVersion}:${task}:${hex}`
}

export async function createTranslationCacheKey(
  input: TranslationCacheKeyInput
): Promise<string> {
  const schemaVersion = input.schemaVersion ?? AI_RESULT_CACHE_SCHEMA_VERSION

  return digestCacheKey(schemaVersion, 'translation', [
    schemaVersion,
    'translation',
    input.provider ?? DEFAULT_AI_CACHE_PROVIDER,
    input.endpoint,
    input.model,
    input.taskRevision ?? TRANSLATION_TASK_REVISION,
    input.sourceLang,
    input.targetLang,
    input.input,
  ])
}

export async function createCorrectionCacheKey(
  input: CorrectionCacheKeyInput
): Promise<string> {
  const schemaVersion = input.schemaVersion ?? AI_RESULT_CACHE_SCHEMA_VERSION

  return digestCacheKey(schemaVersion, 'correction', [
    schemaVersion,
    'correction',
    input.provider ?? DEFAULT_AI_CACHE_PROVIDER,
    input.endpoint,
    input.model,
    input.taskRevision ?? CORRECTION_TASK_REVISION,
    input.language,
    input.level,
    input.input,
  ])
}
