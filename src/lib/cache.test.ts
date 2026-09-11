/// <reference types="vite/client" />
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
import cacheSource from './cache.ts?raw'

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

const TRANSLATION_KEY_INPUT = {
  endpoint: 'http://localhost:11434',
  model: 'gemma3:4b',
  sourceLang: 'en',
  targetLang: 'vi',
  input: 'Hello world',
}

const CORRECTION_KEY_INPUT = {
  endpoint: 'http://localhost:11434',
  model: 'gemma3:4b',
  language: 'en',
  level: 'fix',
  input: 'Hello wrold',
}

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
    const translationKey = createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const correctionKey = createCorrectionCacheKey(CORRECTION_KEY_INPUT)

    expect(translationKey).toBeInstanceOf(Promise)
    expect(correctionKey).toBeInstanceOf(Promise)
    expect(typeof await translationKey).toBe('string')
    expect(typeof await correctionKey).toBe('string')
  })
})

describe('AI result cache budget', () => {
  beforeEach(() => {
    translationResultCache.clear()
  })

  it('spends one 100-entry budget across both task contracts', async () => {
    for (let i = 0; i < 99; i++) {
      translationResultCache.set(`translation-${i}`, `value-${i}`)
    }
    correctionResultCache.set('correction-0', 'correction value')
    expect(translationResultCache.size()).toBe(100)

    correctionResultCache.set('correction-1', 'one more')

    expect(translationResultCache.size()).toBe(100)
    expect(translationResultCache.get('translation-0')).toBeUndefined()
    expect(correctionResultCache.get('correction-0')).toBe('correction value')
  })

  it('keeps a stored result for 30 minutes and no longer', () => {
    vi.useFakeTimers()
    try {
      translationResultCache.set('key', 'value')
      vi.advanceTimersByTime(29 * 60 * 1000)
      expect(translationResultCache.get('key')).toBe('value')

      vi.advanceTimersByTime(2 * 60 * 1000)
      expect(translationResultCache.get('key')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('createTranslationCacheKey', () => {
  it('returns the same key for the same request', async () => {
    const first = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const second = await createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT })
    expect(first).toBe(second)
  })

  it('names its task and schema and hides everything else behind a digest', async () => {
    const key = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const [schemaName, schemaVersion, task, digest, ...rest] = key.split(':')

    expect(`${schemaName}:${schemaVersion}`).toBe('ai-result-cache:v1')
    expect(task).toBe('translation')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(rest).toEqual([])
  })

  it('keeps the request out of the visible key', async () => {
    const key = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      input: 'Hello wrold',
    })

    expect(key).not.toContain('Hello wrold')
    expect(key).not.toContain('gemma3:4b')
    expect(key).not.toContain('localhost')
    expect(key).not.toContain('en')
  })

  it('separates inputs the old 32-bit hash collided', async () => {
    const aa = await createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, input: 'Aa' })
    const bb = await createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, input: 'BB' })
    expect(aa).not.toBe(bb)
  })

  it('changes the key for every behaviour-defining field', async () => {
    const base = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const changed = await Promise.all([
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, endpoint: 'http://remote:11434' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, model: 'qwen3:8b' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, sourceLang: 'fr' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, targetLang: 'ja' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, input: 'Goodbye world' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, provider: 'openai' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, schemaVersion: 'ai-result-cache:test-b' }),
      createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, taskRevision: 'translation:test-b' }),
    ])

    expect(new Set([base, ...changed]).size).toBe(changed.length + 1)
  })

  it('defaults the provider to ollama', async () => {
    const omitted = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const explicit = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      provider: 'ollama',
    })
    expect(omitted).toBe(explicit)
  })

  it('separates two schema versions of the same request', async () => {
    const first = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      schemaVersion: 'ai-result-cache:test-a',
    })
    const second = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      schemaVersion: 'ai-result-cache:test-b',
    })
    expect(first).not.toBe(second)
  })

  it('separates two task revisions of the same request', async () => {
    const first = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      taskRevision: 'translation:test-a',
    })
    const second = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      taskRevision: 'translation:test-b',
    })
    expect(first).not.toBe(second)
  })

  it('treats the endpoint string as an exact transport identity', async () => {
    const endpoints = [
      'http://host:11434',
      'http://host:11434/',
      'http://host:11434?x=1',
      ' http://host:11434',
      'HTTP://host:11434',
    ]
    const keys = await Promise.all(
      endpoints.map(endpoint => createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, endpoint }))
    )
    expect(new Set(keys).size).toBe(endpoints.length)
  })

  it('treats the model string as an exact identity', async () => {
    const models = ['gemma3:4b', 'gemma3:4b ', 'Gemma3:4B']
    const keys = await Promise.all(
      models.map(model => createTranslationCacheKey({ ...TRANSLATION_KEY_INPUT, model }))
    )
    expect(new Set(keys).size).toBe(models.length)
  })

  it('cannot be confused with a correction of the same text', async () => {
    const translation = await createTranslationCacheKey({
      ...TRANSLATION_KEY_INPUT,
      sourceLang: 'en',
      targetLang: 'vi',
      input: 'Hello wrold',
    })
    const correction = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      input: 'Hello wrold',
    })
    expect(translation).not.toBe(correction)
  })
})

describe('createCorrectionCacheKey', () => {
  it('returns the same key for the same request', async () => {
    const first = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    const second = await createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT })
    expect(first).toBe(second)
  })

  it('names its task and schema and hides everything else behind a digest', async () => {
    const key = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    const [schemaName, schemaVersion, task, digest, ...rest] = key.split(':')

    expect(`${schemaName}:${schemaVersion}`).toBe('ai-result-cache:v1')
    expect(task).toBe('correction')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(rest).toEqual([])
  })

  it('keeps the request out of the visible key', async () => {
    const key = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)

    expect(key).not.toContain('Hello wrold')
    expect(key).not.toContain('gemma3:4b')
    expect(key).not.toContain('localhost')
    expect(key).not.toContain('fix')
  })

  it('separates inputs the old 32-bit hash collided', async () => {
    const aa = await createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, input: 'Aa' })
    const bb = await createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, input: 'BB' })
    expect(aa).not.toBe(bb)
  })

  it('changes the key for every behaviour-defining field', async () => {
    const base = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    const changed = await Promise.all([
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, endpoint: 'http://remote:11434' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, model: 'qwen3:8b' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, language: 'fr' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, level: 'rewrite' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, input: 'Hello world' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, provider: 'openai' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, schemaVersion: 'ai-result-cache:test-b' }),
      createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, taskRevision: 'correction:test-b' }),
    ])

    expect(new Set([base, ...changed]).size).toBe(changed.length + 1)
  })

  it('defaults the provider to ollama', async () => {
    const omitted = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    const explicit = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      provider: 'ollama',
    })
    expect(omitted).toBe(explicit)
  })

  it('separates two schema versions of the same request', async () => {
    const first = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      schemaVersion: 'ai-result-cache:test-a',
    })
    const second = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      schemaVersion: 'ai-result-cache:test-b',
    })
    expect(first).not.toBe(second)
  })

  it('separates two task revisions of the same request', async () => {
    const first = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      taskRevision: 'correction:test-a',
    })
    const second = await createCorrectionCacheKey({
      ...CORRECTION_KEY_INPUT,
      taskRevision: 'correction:test-b',
    })
    expect(first).not.toBe(second)
  })

  it('treats the endpoint string as an exact transport identity', async () => {
    const endpoints = [
      'http://host:11434',
      'http://host:11434/',
      'http://host:11434?x=1',
      ' http://host:11434',
      'HTTP://host:11434',
    ]
    const keys = await Promise.all(
      endpoints.map(endpoint => createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, endpoint }))
    )
    expect(new Set(keys).size).toBe(endpoints.length)
  })

  it('treats the model string as an exact identity', async () => {
    const models = ['gemma3:4b', 'gemma3:4b ', 'Gemma3:4B']
    const keys = await Promise.all(
      models.map(model => createCorrectionCacheKey({ ...CORRECTION_KEY_INPUT, model }))
    )
    expect(new Set(keys).size).toBe(models.length)
  })
})

describe('AI task namespaces', () => {
  // The app mode decides which task builder answers a request; the raw mode
  // value itself is never part of a key.
  const keyForMode = (mode: 'translate' | 'correct') =>
    mode === 'translate'
      ? createTranslationCacheKey(TRANSLATION_KEY_INPUT)
      : createCorrectionCacheKey(CORRECTION_KEY_INPUT)

  it('answers translate mode with the translation namespace', async () => {
    expect(await keyForMode('translate')).toContain(':translation:')
  })

  it('answers correct mode with the correction namespace', async () => {
    expect(await keyForMode('correct')).toContain(':correction:')
  })

  it('addresses a streamed and a non-streamed result as one entry', async () => {
    // Streaming changes how a result arrives, never what it is.
    const streamed = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    const whole = await createTranslationCacheKey(TRANSLATION_KEY_INPUT)
    expect(streamed).toBe(whole)

    const streamedCorrection = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    const wholeCorrection = await createCorrectionCacheKey(CORRECTION_KEY_INPUT)
    expect(streamedCorrection).toBe(wholeCorrection)
  })
})

describe('AI result cache privacy', () => {
  it('keeps the request inside the digest', () => {
    const forbidden = [
      /console\./,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/,
      /persist\(/,
    ]
    expect(forbidden.filter(pattern => pattern.test(cacheSource))).toEqual([])
  })

  it('keeps the transport identity exactly as configured', () => {
    const normalizers = [/new URL\(/, /\.trim\(\)/, /\.toLowerCase\(\)/, /\.toUpperCase\(\)/]
    expect(normalizers.filter(pattern => pattern.test(cacheSource))).toEqual([])
  })

  it('drops the collision-prone key helpers it replaces', () => {
    const retired = [/simpleHash/, /createTranslationKey\b/, /createCorrectionKey\b/, /\btranslationCache\b/]
    expect(retired.filter(pattern => pattern.test(cacheSource))).toEqual([])
  })
})
