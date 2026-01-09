import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  getLanguageName,
  getLanguageNativeName,
  isSameLanguage,
  shouldUseCorrection,
} from './language'

describe('SUPPORTED_LANGUAGES', () => {
  it('is defined and non-empty', () => {
    expect(SUPPORTED_LANGUAGES).toBeDefined()
    expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true)
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0)
  })

  it('includes auto-detect option', () => {
    const autoDetect = SUPPORTED_LANGUAGES.find(lang => lang.code === 'auto')
    expect(autoDetect).toBeDefined()
    expect(autoDetect?.name).toBe('Auto Detect')
  })

  it('includes common languages', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code)
    expect(codes).toContain('en')
    expect(codes).toContain('ja')
    expect(codes).toContain('vi')
    expect(codes).toContain('zh')
    expect(codes).toContain('ko')
  })

  it('each language has code, name, and nativeName', () => {
    SUPPORTED_LANGUAGES.forEach(lang => {
      expect(lang.code).toBeDefined()
      expect(lang.name).toBeDefined()
      expect(lang.nativeName).toBeDefined()
    })
  })
})

describe('detectLanguage', () => {
  it('returns "en" for empty input', () => {
    expect(detectLanguage('')).toBe('en')
    expect(detectLanguage('   ')).toBe('en')
  })

  it('detects Japanese (Hiragana)', () => {
    expect(detectLanguage('こんにちは')).toBe('ja')
  })

  it('detects Japanese (Katakana)', () => {
    expect(detectLanguage('カタカナ')).toBe('ja')
  })

  it('detects Japanese (mixed with Kanji)', () => {
    expect(detectLanguage('今日は良い天気です')).toBe('ja')
  })

  it('detects Korean (Hangul)', () => {
    expect(detectLanguage('안녕하세요')).toBe('ko')
  })

  it('detects Vietnamese (diacritics)', () => {
    expect(detectLanguage('Xin chào')).toBe('vi')
    expect(detectLanguage('Tiếng Việt')).toBe('vi')
  })

  it('detects Chinese characters', () => {
    expect(detectLanguage('你好世界')).toBe('zh')
  })

  it('defaults to English for Latin text', () => {
    expect(detectLanguage('Hello world')).toBe('en')
    expect(detectLanguage('Bonjour')).toBe('en') // French without diacritics
  })

  it('samples only first 500 characters', () => {
    const longText = 'a'.repeat(600) + 'こんにちは'
    expect(detectLanguage(longText)).toBe('en') // Japanese is past 500 chars
  })
})

describe('getLanguageName', () => {
  it('returns name for known language codes', () => {
    expect(getLanguageName('en')).toBe('English')
    expect(getLanguageName('ja')).toBe('Japanese')
    expect(getLanguageName('vi')).toBe('Vietnamese')
  })

  it('returns code for unknown language codes', () => {
    expect(getLanguageName('xyz')).toBe('xyz')
    expect(getLanguageName('unknown')).toBe('unknown')
  })

  it('handles auto-detect', () => {
    expect(getLanguageName('auto')).toBe('Auto Detect')
  })
})

describe('getLanguageNativeName', () => {
  it('returns native name for known language codes', () => {
    expect(getLanguageNativeName('ja')).toBe('日本語')
    expect(getLanguageNativeName('vi')).toBe('Tiếng Việt')
    expect(getLanguageNativeName('ko')).toBe('한국어')
  })

  it('returns code for unknown language codes', () => {
    expect(getLanguageNativeName('xyz')).toBe('xyz')
  })
})

describe('isSameLanguage', () => {
  it('returns true for matching codes', () => {
    expect(isSameLanguage('en', 'en')).toBe(true)
    expect(isSameLanguage('ja', 'ja')).toBe(true)
  })

  it('returns false for different codes', () => {
    expect(isSameLanguage('en', 'ja')).toBe(false)
  })

  it('returns false when source is auto', () => {
    expect(isSameLanguage('auto', 'auto')).toBe(false)
    expect(isSameLanguage('auto', 'en')).toBe(false)
  })
})

describe('shouldUseCorrection', () => {
  it('returns true when detected language matches target', () => {
    expect(shouldUseCorrection('Hello world', 'en')).toBe(true)
    expect(shouldUseCorrection('こんにちは', 'ja')).toBe(true)
  })

  it('returns false when detected language differs from target', () => {
    expect(shouldUseCorrection('Hello world', 'ja')).toBe(false)
    expect(shouldUseCorrection('こんにちは', 'en')).toBe(false)
  })
})
