import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LRUCache, translationCache, createTranslationKey, createCorrectionKey } from './cache'

describe('LRUCache', () => {
  let cache: LRUCache<string>

  beforeEach(() => {
    cache = new LRUCache<string>(3, 1) // maxSize 3, ttl 1 minute
  })

  describe('constructor', () => {
    it('uses default values when none provided', () => {
      const defaultCache = new LRUCache<string>()
      expect(defaultCache.size()).toBe(0)
    })
  })

  describe('set and get', () => {
    it('stores and retrieves values', () => {
      cache.set('key1', 'value1')
      expect(cache.get('key1')).toBe('value1')
    })

    it('returns undefined for non-existent keys', () => {
      expect(cache.get('missing')).toBeUndefined()
    })

    it('overwrites existing values', () => {
      cache.set('key1', 'value1')
      cache.set('key1', 'value2')
      expect(cache.get('key1')).toBe('value2')
      expect(cache.size()).toBe(1)
    })
  })

  describe('LRU eviction', () => {
    it('evicts oldest entry when at capacity', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      cache.set('key4', 'value4') // Should evict key1

      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBe('value2')
      expect(cache.get('key3')).toBe('value3')
      expect(cache.get('key4')).toBe('value4')
    })

    it('updates position on get (most recently used)', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      cache.get('key1') // Move key1 to end
      cache.set('key4', 'value4') // Should evict key2 now

      expect(cache.get('key1')).toBe('value1')
      expect(cache.get('key2')).toBeUndefined()
    })
  })

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns value before TTL expires', () => {
      cache.set('key1', 'value1')
      vi.advanceTimersByTime(30 * 1000) // 30 seconds
      expect(cache.get('key1')).toBe('value1')
    })

    it('returns undefined after TTL expires', () => {
      cache.set('key1', 'value1')
      vi.advanceTimersByTime(61 * 1000) // 61 seconds (TTL is 1 minute)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('removes expired entry from cache', () => {
      cache.set('key1', 'value1')
      vi.advanceTimersByTime(61 * 1000)
      cache.get('key1') // Triggers removal
      expect(cache.size()).toBe(0)
    })
  })

  describe('has', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns true for existing keys', () => {
      cache.set('key1', 'value1')
      expect(cache.has('key1')).toBe(true)
    })

    it('returns false for non-existent keys', () => {
      expect(cache.has('missing')).toBe(false)
    })

    it('returns false for expired keys', () => {
      cache.set('key1', 'value1')
      vi.advanceTimersByTime(61 * 1000)
      expect(cache.has('key1')).toBe(false)
    })
  })

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.clear()
      expect(cache.size()).toBe(0)
      expect(cache.get('key1')).toBeUndefined()
    })
  })

  describe('size', () => {
    it('returns correct count', () => {
      expect(cache.size()).toBe(0)
      cache.set('key1', 'value1')
      expect(cache.size()).toBe(1)
      cache.set('key2', 'value2')
      expect(cache.size()).toBe(2)
    })
  })
})

describe('translationCache singleton', () => {
  beforeEach(() => {
    translationCache.clear()
  })

  it('is an LRUCache instance', () => {
    expect(translationCache).toBeInstanceOf(LRUCache)
  })

  it('stores and retrieves translations', () => {
    translationCache.set('test-key', 'translated text')
    expect(translationCache.get('test-key')).toBe('translated text')
  })
})

describe('createTranslationKey', () => {
  it('creates unique keys for different inputs', () => {
    const key1 = createTranslationKey('hello', 'en', 'ja', 'model1')
    const key2 = createTranslationKey('hello', 'en', 'ko', 'model1')
    const key3 = createTranslationKey('world', 'en', 'ja', 'model1')
    const key4 = createTranslationKey('hello', 'en', 'ja', 'model2')

    expect(key1).not.toBe(key2) // different target
    expect(key1).not.toBe(key3) // different text
    expect(key1).not.toBe(key4) // different model
  })

  it('creates same key for same inputs', () => {
    const key1 = createTranslationKey('hello', 'en', 'ja', 'model1')
    const key2 = createTranslationKey('hello', 'en', 'ja', 'model1')
    expect(key1).toBe(key2)
  })

  it('includes model, source, target and hash in key', () => {
    const key = createTranslationKey('test', 'en', 'ja', 'qwen')
    expect(key).toContain('qwen')
    expect(key).toContain('en')
    expect(key).toContain('ja')
  })
})

describe('createCorrectionKey', () => {
  it('creates unique keys for different inputs', () => {
    const key1 = createCorrectionKey('hello', 'en', 'fix', 'model1')
    const key2 = createCorrectionKey('hello', 'en', 'improve', 'model1')
    const key3 = createCorrectionKey('hello', 'ja', 'fix', 'model1')
    const key4 = createCorrectionKey('world', 'en', 'fix', 'model1')

    expect(key1).not.toBe(key2) // different level
    expect(key1).not.toBe(key3) // different language
    expect(key1).not.toBe(key4) // different text
  })

  it('creates same key for same inputs', () => {
    const key1 = createCorrectionKey('hello', 'en', 'fix', 'model1')
    const key2 = createCorrectionKey('hello', 'en', 'fix', 'model1')
    expect(key1).toBe(key2)
  })

  it('includes model, language, level and hash in key', () => {
    const key = createCorrectionKey('test', 'en', 'fix', 'qwen')
    expect(key).toContain('qwen')
    expect(key).toContain('en')
    expect(key).toContain('fix')
  })
})
