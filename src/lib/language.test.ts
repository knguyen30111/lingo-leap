import { describe, it, expect } from 'vitest'
import { SUPPORTED_LANGUAGES } from './language'

describe('language', () => {
  it('has supported languages defined', () => {
    expect(SUPPORTED_LANGUAGES).toBeDefined()
    expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true)
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0)
  })

  it('includes auto-detect option', () => {
    const autoDetect = SUPPORTED_LANGUAGES.find(lang => lang.code === 'auto')
    expect(autoDetect).toBeDefined()
  })
})
