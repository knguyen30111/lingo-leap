// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { cspRule, EXPECTED_DIRECTIVES, parsePolicy } from './csp.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-rule-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

const INTENDED_POLICY = Object.entries(EXPECTED_DIRECTIVES)
  .map(([name, sources]) => `${name} ${sources.join(' ')}`)
  .join('; ')

function writeConfig(security) {
  const target = path.join(fixture, 'src-tauri')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(
    path.join(target, 'tauri.conf.json'),
    JSON.stringify({ app: { security } }, null, 2)
  )
}

function run() {
  return cspRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

/** The intended policy with one directive replaced or removed. */
function policyWith(overrides) {
  return Object.entries({ ...EXPECTED_DIRECTIVES, ...overrides })
    .filter(([, sources]) => sources !== null)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

describe('csp rule', () => {
  it('reports nothing for the intended policy', () => {
    writeConfig({ csp: INTENDED_POLICY, devCsp: null })

    expect(run()).toEqual([])
  })

  it('is insensitive to directive and source ordering', () => {
    const reordered = Object.entries(EXPECTED_DIRECTIVES)
      .reverse()
      .map(([name, sources]) => `${name} ${[...sources].reverse().join(' ')}`)
      .join('; ')
    writeConfig({ csp: reordered, devCsp: null })

    expect(run()).toEqual([])
  })

  // The defect this phase closes.
  it('reports a null policy', () => {
    writeConfig({ csp: null, devCsp: null })

    expect(messages()).toContain('app.security.csp must be a non-empty policy string')
  })

  it('reports an absent policy', () => {
    writeConfig({ devCsp: null })

    expect(messages()).toContain('app.security.csp must be a non-empty policy string')
  })

  it('reports a policy that is an object rather than a string', () => {
    writeConfig({ csp: { 'default-src': "'self'" }, devCsp: null })

    expect(messages()).toContain('app.security.csp must be a non-empty policy string')
  })

  it('names a missing directive', () => {
    writeConfig({ csp: policyWith({ 'object-src': null }), devCsp: null })

    expect(messages()).toContain('the policy declares no object-src directive')
  })

  // A rule that only checked for non-null would accept this.
  it('rejects a wide default-src', () => {
    writeConfig({ csp: policyWith({ 'default-src': ['*'] }), devCsp: null })

    expect(messages()).toContain("default-src must permit exactly 'self'")
  })

  it("reports 'unsafe-inline' in script-src", () => {
    writeConfig({ csp: policyWith({ 'script-src': ["'self'", "'unsafe-inline'"] }), devCsp: null })

    expect(messages()).toContain("script-src contains 'unsafe-inline'")
  })

  it('reports unsafe-eval in any directive, not just script-src', () => {
    writeConfig({ csp: policyWith({ 'style-src': ["'self'", "'unsafe-eval'"] }), devCsp: null })

    expect(messages()).toContain('style-src contains unsafe-eval')
  })

  it('reports dangerousDisableAssetCspModification set to true', () => {
    writeConfig({ csp: INTENDED_POLICY, devCsp: null, dangerousDisableAssetCspModification: true })

    expect(messages()).toContain("disables Tauri's own nonce injection")
  })

  it('accepts dangerousDisableAssetCspModification set to false', () => {
    writeConfig({ csp: INTENDED_POLICY, devCsp: null, dangerousDisableAssetCspModification: false })

    expect(run()).toEqual([])
  })

  // Dropping either source is a compatibility break, not a tightening.
  it('reports a connect-src that has dropped http:', () => {
    const sources = EXPECTED_DIRECTIVES['connect-src'].filter(s => s !== 'http:')
    writeConfig({ csp: policyWith({ 'connect-src': sources }), devCsp: null })

    expect(messages()).toContain('connect-src must keep http:')
  })

  it('reports a connect-src that has dropped https:', () => {
    const sources = EXPECTED_DIRECTIVES['connect-src'].filter(s => s !== 'https:')
    writeConfig({ csp: policyWith({ 'connect-src': sources }), devCsp: null })

    expect(messages()).toContain('connect-src must keep https:')
  })

  it('reports a connect-src narrowed to loopback', () => {
    writeConfig({ csp: policyWith({ 'connect-src': ["'self'", 'http://localhost:11434'] }), devCsp: null })

    const text = messages()
    expect(text).toContain('connect-src must keep http:')
    expect(text).toContain('connect-src must keep https:')
  })

  it('reports an absent devCsp', () => {
    writeConfig({ csp: INTENDED_POLICY })

    expect(messages()).toContain('app.security.devCsp must be present and null')
  })

  it('reports a devCsp set to a string', () => {
    writeConfig({ csp: INTENDED_POLICY, devCsp: "default-src 'self'" })

    expect(messages()).toContain('app.security.devCsp must be null')
  })

  it('reports a missing configuration file', () => {
    expect(messages()).toContain('src-tauri/tauri.conf.json is missing')
  })
})

describe('policy parsing', () => {
  it('splits directives on semicolons and sources on whitespace', () => {
    const parsed = parsePolicy("default-src 'self'; img-src 'self' data:")

    expect(parsed.get('default-src')).toEqual(["'self'"])
    expect(parsed.get('img-src')).toEqual(["'self'", 'data:'])
  })

  it('tolerates trailing semicolons and extra whitespace', () => {
    const parsed = parsePolicy("  default-src   'self' ;  ; ")

    expect(parsed.get('default-src')).toEqual(["'self'"])
    expect(parsed.size).toBe(1)
  })
})
