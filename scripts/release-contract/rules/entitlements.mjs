import { finding } from '../lib/findings.mjs'

// The macOS entitlement set, the usage descriptions macOS needs to prompt for
// the one capability the app does use, and the Hardened Runtime the removals
// were justified against.
//
// The plists are read with targeted expressions rather than a parser: three
// files, two shapes. XML comments are stripped first, so a commented-out key
// neither counts as declared nor satisfies a required-key assertion.

const ENTITLEMENTS = 'src-tauri/Entitlements.plist'
const INFO_PLIST = 'src-tauri/Info.plist'
const CONFIG = 'src-tauri/tauri.conf.json'

export const ALLOWED_ENTITLEMENTS = ['com.apple.security.device.audio-input']

// Listed beyond the two present today, so the rule resists a future edit that
// swaps one dangerous exception for a neighbouring one.
const FORBIDDEN_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.allow-dyld-environment-variables',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.cs.disable-executable-page-protection',
  'com.apple.security.network.client',
]

const REQUIRED_USAGE_DESCRIPTIONS = [
  'NSMicrophoneUsageDescription',
  'NSSpeechRecognitionUsageDescription',
]

export function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '')
}

export function declaredKeys(xml) {
  return [...stripComments(xml).matchAll(/<key>([^<]*)<\/key>/g)].map(match => match[1].trim())
}

/** The raw markup immediately following a given key, or null if absent. */
function valueAfterKey(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = stripComments(xml).match(
    new RegExp(`<key>\\s*${escaped}\\s*<\\/key>\\s*([\\s\\S]*?)(?=<key>|<\\/dict>)`)
  )
  return match ? match[1].trim() : null
}

function checkEntitlements(ctx, findings) {
  const xml = ctx.readText(ENTITLEMENTS)
  if (xml === null) {
    findings.push(finding({ message: `${ENTITLEMENTS} is missing`, file: ENTITLEMENTS }))
    return
  }

  const keys = declaredKeys(xml)
  const sorted = [...new Set(keys)].sort()
  const expected = [...ALLOWED_ENTITLEMENTS].sort()
  if (sorted.length !== expected.length || sorted.some((key, i) => key !== expected[i])) {
    const extra = sorted.filter(key => !expected.includes(key))
    findings.push(finding({
      message: 'the entitlement set must be exactly the microphone entitlement the app is proven to need',
      file: ENTITLEMENTS,
      evidence: extra.length ? `unexpected: ${extra.join(', ')}` : `declared: ${sorted.join(', ') || '(none)'}`,
    }))
  }

  for (const key of ALLOWED_ENTITLEMENTS) {
    if (!keys.includes(key)) continue
    const value = valueAfterKey(xml, key)
    if (value !== '<true/>') {
      findings.push(finding({
        message: `${key} must be <true/>`,
        file: ENTITLEMENTS,
        evidence: value ?? '(no value)',
      }))
    }
  }

  for (const key of FORBIDDEN_ENTITLEMENTS) {
    if (keys.includes(key)) {
      findings.push(finding({
        message: `${ENTITLEMENTS} declares ${key}, which this process does not need`,
        file: ENTITLEMENTS,
        evidence: key,
      }))
    }
  }
}

// The counterweight to minimization: without these, macOS never prompts and the
// microphone feature fails silently.
function checkUsageDescriptions(ctx, findings) {
  const xml = ctx.readText(INFO_PLIST)
  if (xml === null) {
    findings.push(finding({ message: `${INFO_PLIST} is missing`, file: INFO_PLIST }))
    return
  }
  const keys = declaredKeys(xml)
  for (const key of REQUIRED_USAGE_DESCRIPTIONS) {
    if (!keys.includes(key)) {
      findings.push(finding({
        message: `${INFO_PLIST} declares no ${key}, so macOS cannot prompt for the capability`,
        file: INFO_PLIST,
      }))
      continue
    }
    const value = valueAfterKey(xml, key) ?? ''
    const text = value.match(/<string>([\s\S]*?)<\/string>/)
    if (!text || text[1].trim() === '') {
      findings.push(finding({
        message: `${key} must have a non-empty string value`,
        file: INFO_PLIST,
        evidence: value || '(no value)',
      }))
    }
  }
}

function checkBundleConfig(ctx, findings) {
  const config = ctx.readJson(CONFIG)
  if (!config.ok) {
    findings.push(finding({
      message: config.reason === 'missing' ? `${CONFIG} is missing` : `${CONFIG} is not valid JSON`,
      file: CONFIG,
    }))
    return
  }
  const macOS = config.value?.bundle?.macOS ?? {}

  if (macOS.entitlements !== 'Entitlements.plist') {
    findings.push(finding({
      message: 'bundle.macOS.entitlements must point at Entitlements.plist, or the file is silently detached from the build',
      file: CONFIG,
      evidence: JSON.stringify(macOS.entitlements ?? null),
    }))
  }

  // Absent is a finding even though Tauri defaults it to true: an unstated
  // default was misread once, and the exceptions were removed on the strength
  // of the Hardened Runtime being in force.
  if (!('hardenedRuntime' in macOS)) {
    findings.push(finding({
      message: 'bundle.macOS.hardenedRuntime must be stated explicitly as true, not left to an unstated default',
      file: CONFIG,
    }))
  } else if (macOS.hardenedRuntime !== true) {
    findings.push(finding({
      message: 'bundle.macOS.hardenedRuntime must be true; the entitlement minimization depends on it',
      file: CONFIG,
      evidence: JSON.stringify(macOS.hardenedRuntime),
    }))
  }
}

export const entitlementsRule = {
  id: 'entitlements',
  title: 'The macOS entitlement set is minimal and the Hardened Runtime is explicit',
  check(ctx) {
    const findings = []
    checkEntitlements(ctx, findings)
    checkUsageDescriptions(ctx, findings)
    checkBundleConfig(ctx, findings)
    return findings
  },
}
