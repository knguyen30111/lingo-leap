import { finding } from '../lib/findings.mjs'

// The webview's Content Security Policy, asserted directive by directive
// against the sources the app is proven to use. A rule that only checked "csp
// is not null" would accept `default-src *`, so every directive is compared as
// an exact set — order-insensitive, because reordering a source list is not a
// policy change.

const CONFIG = 'src-tauri/tauri.conf.json'

export const EXPECTED_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'ipc:', 'http://ipc.localhost', 'http:', 'https:'],
  'media-src': ["'none'"],
  'worker-src': ["'none'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
}

// Configurable Ollama endpoints are a compatibility guarantee, so these two are
// asserted in the positive direction: a future "tightening" that drops them
// would silently break every user who has already persisted a remote host.
const REQUIRED_CONNECT_SOURCES = ['http:', 'https:']

export function parsePolicy(policy) {
  const directives = new Map()
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) continue
    directives.set(parts[0].toLowerCase(), parts.slice(1))
  }
  return directives
}

function sameSet(actual, expected) {
  const a = [...new Set(actual)].sort()
  const b = [...new Set(expected)].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export const cspRule = {
  id: 'csp',
  title: 'The webview runs under an explicit, minimal Content Security Policy',
  check(ctx) {
    const findings = []
    const config = ctx.readJson(CONFIG)
    if (!config.ok) {
      findings.push(finding({
        message: config.reason === 'missing' ? `${CONFIG} is missing` : `${CONFIG} is not valid JSON`,
        file: CONFIG,
        evidence: config.error,
      }))
      return findings
    }

    const security = config.value?.app?.security ?? {}
    const policy = security.csp

    if (typeof policy !== 'string' || policy.trim() === '') {
      findings.push(finding({
        message: 'app.security.csp must be a non-empty policy string; a null or absent policy enforces nothing',
        file: CONFIG,
        evidence: JSON.stringify(policy ?? null),
      }))
    } else {
      const directives = parsePolicy(policy)

      for (const [name, expected] of Object.entries(EXPECTED_DIRECTIVES)) {
        const actual = directives.get(name)
        if (actual === undefined) {
          findings.push(finding({
            message: `the policy declares no ${name} directive`,
            file: CONFIG,
          }))
          continue
        }
        if (!sameSet(actual, expected)) {
          findings.push(finding({
            message: `${name} must permit exactly ${expected.join(' ')}`,
            file: CONFIG,
            evidence: `${name} ${actual.join(' ')}`,
          }))
        }
      }

      for (const [name, sources] of directives) {
        for (const source of sources) {
          if (source.replace(/'/g, '').toLowerCase() === 'unsafe-eval') {
            findings.push(finding({
              message: `${name} contains unsafe-eval, which is never permitted in any directive`,
              file: CONFIG,
              evidence: `${name} ${sources.join(' ')}`,
            }))
          }
        }
      }

      const scriptSrc = directives.get('script-src') ?? []
      if (scriptSrc.some(source => source.replace(/'/g, '').toLowerCase() === 'unsafe-inline')) {
        findings.push(finding({
          message: "script-src contains 'unsafe-inline', which is never permitted",
          file: CONFIG,
          evidence: `script-src ${scriptSrc.join(' ')}`,
        }))
      }

      const connectSrc = directives.get('connect-src') ?? []
      for (const source of REQUIRED_CONNECT_SOURCES) {
        if (!connectSrc.includes(source)) {
          findings.push(finding({
            message: `connect-src must keep ${source}: configurable Ollama endpoints are a compatibility guarantee, and dropping it would break every persisted remote host`,
            file: CONFIG,
            evidence: `connect-src ${connectSrc.join(' ')}`,
          }))
        }
      }
    }

    // Tauri must keep injecting nonces for its own initialization scripts.
    if (security.dangerousDisableAssetCspModification === true) {
      findings.push(finding({
        message: 'dangerousDisableAssetCspModification disables Tauri\'s own nonce injection and must be absent or false',
        file: CONFIG,
      }))
    }

    // Tauri applies the production policy in development whenever devCsp is
    // absent. Setting it explicitly to null makes that scope a stated choice
    // rather than an inherited side effect.
    if (!('devCsp' in security)) {
      findings.push(finding({
        message: 'app.security.devCsp must be present and null, so setting csp does not silently change development behavior',
        file: CONFIG,
      }))
    } else if (security.devCsp !== null) {
      findings.push(finding({
        message: 'app.security.devCsp must be null; a development CSP is out of scope',
        file: CONFIG,
        evidence: JSON.stringify(security.devCsp),
      }))
    }

    return findings
  },
}
