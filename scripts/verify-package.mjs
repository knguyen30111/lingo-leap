#!/usr/bin/env node
// The single authority for what a produced macOS bundle must satisfy.
//
// Invoked as `npm run verify:package -- <bundle-root>`. The bundle root is an
// argument, not a default, so the same command works against the workflow's
// src-tauri/target/release/bundle and against a local mktemp -d target
// directory — which is the whole basis of the claim that the workflow's
// assertions are verified locally before the workflow has ever run.
//
// Every assertion lives here rather than in inline workflow shell, because this
// file has unit tests and a YAML `run:` block does not.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const EXIT_OK = 0
export const EXIT_FINDINGS = 1
export const EXIT_USAGE = 2

export const EXPECTED_ENTITLEMENTS = ['com.apple.security.device.audio-input']
export const EXPECTED_EXECUTABLE = 'tran-app'

// ---------------------------------------------------------------------------
// Pure parsers. These are the parts that misparse in practice, so they are
// exported and tested against recorded tool output rather than trusted.
// ---------------------------------------------------------------------------

/** `lipo -archs` prints a space-separated list on one line. */
export function parseArchs(text) {
  return text.trim().split(/\s+/).filter(Boolean)
}

/**
 * The code-directory flags token from `codesign -dv --verbose=4`, e.g.
 * "flags=0x10002(adhoc,runtime)" -> ['adhoc', 'runtime'].
 */
export function parseCodesignFlags(text) {
  const match = text.match(/flags=0x[0-9a-f]+\(([^)]*)\)/i)
  return match ? match[1].split(',').map(s => s.trim()).filter(Boolean) : []
}

export function parseSignatureMode(text) {
  const match = text.match(/^Signature=(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Entitlement keys from `codesign -d --entitlements -`. Recent codesign prints
 * a bracketed dict ("[Key] name"); older versions print XML. Both are accepted,
 * because a verifier that understood only one would silently find no keys on
 * the other and report an empty set as a pass.
 */
export function parseEntitlementKeys(text) {
  const keys = [
    ...[...text.matchAll(/<key>([^<]+)<\/key>/g)].map(m => m[1]),
    ...[...text.matchAll(/^\s*\[Key\]\s+(.+?)\s*$/gm)].map(m => m[1]),
  ]
  return [...new Set(keys.map(k => k.trim()))].sort()
}

function sameSet(actual, expected) {
  const a = [...new Set(actual)].sort()
  const b = [...new Set(expected)].sort()
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    combined: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

function plistValue(plistPath, key, exec = run) {
  const result = exec('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath])
  return result.status === 0 ? result.stdout.trim() : null
}

/**
 * @param {string} bundleRoot  directory containing macos/ and dmg/
 * @param {object} deps        injected for tests
 */
export function verifyPackage(bundleRoot, deps = {}) {
  const {
    exec = run,
    readJson = p => JSON.parse(fs.readFileSync(p, 'utf8')),
    readText = p => fs.readFileSync(p, 'utf8'),
    listDir = p => fs.readdirSync(p),
    exists = p => fs.existsSync(p),
    isExecutable = p => {
      try { fs.accessSync(p, fs.constants.X_OK); return true } catch { return false }
    },
    repoRoot = process.cwd(),
  } = deps

  const findings = []
  const fail = (message, evidence) => findings.push({ message, evidence: evidence ?? null })

  if (!exists(bundleRoot)) {
    fail(`bundle root does not exist: ${bundleRoot}`)
    return findings
  }

  // Exactly one .app and exactly one .dmg. Two DMGs means a stale artifact is
  // present and every checksum below would be ambiguous about what it covers.
  const macosDir = path.join(bundleRoot, 'macos')
  const dmgDir = path.join(bundleRoot, 'dmg')
  const apps = exists(macosDir) ? listDir(macosDir).filter(n => n.endsWith('.app')) : []
  const dmgs = exists(dmgDir) ? listDir(dmgDir).filter(n => n.endsWith('.dmg')) : []

  if (apps.length !== 1) fail(`expected exactly one .app under ${macosDir}`, `found ${apps.length}: ${apps.join(', ') || '(none)'}`)
  if (dmgs.length !== 1) fail(`expected exactly one .dmg under ${dmgDir}`, `found ${dmgs.length}: ${dmgs.join(', ') || '(none)'}`)
  if (apps.length !== 1 || dmgs.length !== 1) return findings

  const appPath = path.join(macosDir, apps[0])
  const dmgPath = path.join(dmgDir, dmgs[0])

  // The Cargo package name, not the product name. A verifier looking for
  // Contents/MacOS/<productName> would fail on a correct bundle.
  const binPath = path.join(appPath, 'Contents', 'MacOS', EXPECTED_EXECUTABLE)
  if (!exists(binPath)) {
    fail(`bundle executable not found at Contents/MacOS/${EXPECTED_EXECUTABLE}`, binPath)
    return findings
  }
  if (!isExecutable(binPath)) fail('bundle executable is not executable', binPath)

  const archs = parseArchs(exec('lipo', ['-archs', binPath]).combined)
  if (!sameSet(archs, ['arm64'])) {
    fail('the executable must be arm64 only, with no second slice', archs.join(' ') || '(none)')
  }

  const verify = exec('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  if (verify.status !== 0) fail('codesign --verify --deep --strict failed', verify.combined.trim())

  const dv = exec('codesign', ['-dv', '--verbose=4', appPath]).combined
  const signature = parseSignatureMode(dv)
  if (signature !== 'adhoc') fail('the signature mode must be adhoc', signature ?? '(not reported)')

  const flags = parseCodesignFlags(dv)
  if (!flags.includes('adhoc')) fail('the code-directory flags do not report adhoc', flags.join(',') || '(none)')
  // Required, not a note: the entitlement minimization was justified against a
  // bundle that runs hardened.
  if (!flags.includes('runtime')) {
    fail('the code-directory flags do not report runtime; the Hardened Runtime is not in force', flags.join(',') || '(none)')
  }

  const entitlementKeys = parseEntitlementKeys(exec('codesign', ['-d', '--entitlements', '-', appPath]).combined)
  if (!sameSet(entitlementKeys, EXPECTED_ENTITLEMENTS)) {
    fail(
      `the shipped entitlements must be exactly ${EXPECTED_ENTITLEMENTS.join(', ')}`,
      entitlementKeys.join(', ') || '(none)'
    )
  }

  // Versions are read from the manifests, never hardcoded here.
  let config
  let manifest
  try {
    config = readJson(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'))
    manifest = readJson(path.join(repoRoot, 'package.json'))
  } catch (err) {
    fail('could not read the version authorities', err.message)
    return findings
  }

  const infoPlist = path.join(appPath, 'Contents', 'Info.plist')
  const expectedPlist = {
    CFBundleIdentifier: config.identifier,
    CFBundleShortVersionString: config.version,
    CFBundleVersion: config.version,
    LSMinimumSystemVersion: config.bundle?.macOS?.minimumSystemVersion,
  }
  for (const [key, expected] of Object.entries(expectedPlist)) {
    const actual = plistValue(infoPlist, key, exec)
    if (actual !== expected) {
      fail(`Info.plist ${key} does not match the manifest`, `bundled ${actual ?? '(absent)'} != expected ${expected ?? '(unset)'}`)
    }
  }
  for (const key of ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription']) {
    const actual = plistValue(infoPlist, key, exec)
    if (!actual) fail(`Info.plist is missing ${key}, so macOS cannot prompt for the capability`)
  }

  if (config.version !== manifest.version) {
    fail('package.json and tauri.conf.json disagree about the version', `${manifest.version} != ${config.version}`)
  }

  const csp = config.app?.security?.csp
  if (typeof csp !== 'string' || csp.trim() === '') {
    fail('tauri.conf.json declares no CSP to look for in the executable')
  } else {
    const strings = exec('strings', [binPath]).stdout
    if (!strings.includes(csp)) fail('the configured CSP string is not present in the executable')
  }

  const hdiutil = exec('hdiutil', ['verify', dmgPath])
  if (hdiutil.status !== 0) fail('hdiutil verify failed on the DMG', hdiutil.combined.trim())

  if (typeof config.version === 'string' && !dmgs[0].includes(config.version)) {
    fail('the DMG filename does not contain the agreed version', `${dmgs[0]} does not contain ${config.version}`)
  }

  void readText
  return findings
}

function main(argv) {
  const bundleRoot = argv[0]
  if (!bundleRoot || bundleRoot.startsWith('--')) {
    console.error('usage: npm run verify:package -- <bundle-root>')
    return EXIT_USAGE
  }
  const findings = verifyPackage(path.resolve(bundleRoot))
  if (findings.length === 0) {
    console.log(`package verification: all assertions passed for ${bundleRoot}`)
    return EXIT_OK
  }
  for (const f of findings) {
    console.error(`  - ${f.message}`)
    if (f.evidence) console.error(`    evidence: ${f.evidence}`)
  }
  console.error(`\npackage verification: ${findings.length} finding(s)`)
  return EXIT_FINDINGS
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
