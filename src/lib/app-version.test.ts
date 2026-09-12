import { describe, it, expect } from 'vitest'
import packageManifest from '../../package.json'
import { APP_VERSION } from './app-version'

describe('APP_VERSION', () => {
  // The visible version has exactly one authority. A second copy — in a
  // locale file, a constant, or a comment — is how a shipped build came to
  // display a version it was not.
  it('is the version the package manifest declares', () => {
    expect(APP_VERSION).toBe(packageManifest.version)
  })

  it('is a bare three-part version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
