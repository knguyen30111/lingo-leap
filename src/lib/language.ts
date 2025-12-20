// Language detection and utilities

export interface Language {
  code: string
  name: string
  nativeName: string
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'auto', name: 'Auto Detect', nativeName: 'Auto' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
]

// Character ranges for language detection
const LANGUAGE_PATTERNS = {
  ja: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/,  // Hiragana, Katakana, Kanji
  zh: /[\u4E00-\u9FFF]/,  // Chinese characters (overlaps with Kanji)
  ko: /[\uAC00-\uD7AF\u1100-\u11FF]/,  // Hangul
  vi: /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i,
  // Add more patterns as needed
}

export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) return 'en'

  const sample = text.slice(0, 500) // Sample first 500 chars

  // Check for Japanese (Hiragana/Katakana are definitive)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) {
    return 'ja'
  }

  // Check for Korean
  if (LANGUAGE_PATTERNS.ko.test(sample)) {
    return 'ko'
  }

  // Check for Vietnamese (has unique diacritics)
  if (LANGUAGE_PATTERNS.vi.test(sample)) {
    return 'vi'
  }

  // Check for Chinese (after ruling out Japanese)
  if (LANGUAGE_PATTERNS.zh.test(sample)) {
    return 'zh'
  }

  // Default to English for Latin scripts
  return 'en'
}

export function getLanguageName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code)
  return lang?.name || code
}

export function getLanguageNativeName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code)
  return lang?.nativeName || code
}

export function isSameLanguage(source: string, target: string): boolean {
  if (source === 'auto') return false
  return source === target
}

export function shouldUseCorrection(sourceText: string, targetLang: string): boolean {
  const detectedLang = detectLanguage(sourceText)
  return detectedLang === targetLang
}
