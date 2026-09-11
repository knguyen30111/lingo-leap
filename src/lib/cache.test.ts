import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  LRUCache,
  translationResultCache,
  correctionResultCache,
  createTranslationCacheKey,
  createCorrectionCacheKey,
  TRANSLATION_TASK_REVISION,
  CORRECTION_TASK_REVISION,
} from './cache'

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

describe('AI result cache contracts', () => {
  it('exposes a named cache per AI task', () => {
    expect(translationResultCache).toBeInstanceOf(LRUCache)
    expect(correctionResultCache).toBeInstanceOf(LRUCache)
  })

  it('exposes a task revision per AI task', () => {
    expect(typeof TRANSLATION_TASK_REVISION).toBe('string')
    expect(typeof CORRECTION_TASK_REVISION).toBe('string')
    expect(TRANSLATION_TASK_REVISION).not.toBe(CORRECTION_TASK_REVISION)
  })

  it('builds every task key asynchronously', async () => {
    const translationKey = createTranslationCacheKey({
      endpoint: 'http://localhost:11434',
      model: 'gemma3:4b',
      sourceLang: 'en',
      targetLang: 'vi',
      input: 'Hello world',
    })
    const correctionKey = createCorrectionCacheKey({
      endpoint: 'http://localhost:11434',
      model: 'gemma3:4b',
      language: 'en',
      level: 'fix',
      input: 'Hello wrold',
    })

    expect(translationKey).toBeInstanceOf(Promise)
    expect(correctionKey).toBeInstanceOf(Promise)
    expect(typeof await translationKey).toBe('string')
    expect(typeof await correctionKey).toBe('string')
  })
})
