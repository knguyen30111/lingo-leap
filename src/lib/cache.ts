// LRU Cache for translation results

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

// Singleton instance for translations
export const translationCache = new LRUCache<string>(100, 30)

// Helper to create cache keys
export function createTranslationKey(
  text: string,
  sourceLang: string,
  targetLang: string,
  model: string
): string {
  // Hash the text for shorter keys
  const textHash = simpleHash(text)
  return `${model}:${sourceLang}:${targetLang}:${textHash}`
}

export function createCorrectionKey(
  text: string,
  language: string,
  level: string,
  model: string
): string {
  const textHash = simpleHash(text)
  return `${model}:${language}:${level}:${textHash}`
}

// Simple hash function for cache keys
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}
