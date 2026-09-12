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

// Minimum artifact sizes, in bytes.
//
// Every other assertion here passes happily on a zero-length or truncated
// artifact: the filenames are still right, the plist the bundler wrote is still
// right, and a freshly signed stub still reports `adhoc,runtime`. A floor is the
// only assertion that sees a build whose payload did not actually land.
//
// The floors are derived from measurements of real arm64 artifacts this
// repository produced, recorded with the release verification evidence.
//
//   .app payload   10,392,093 bytes  a 1.1.0 bundle built here under CI=true
//                  13,168,031 bytes  the bundle published under v1.1.0
//   DMG             4,777,012 bytes  the DMG of that same 1.1.0 build
//                   5,802,624 bytes  the DMG published under v1.1.0
//
// Each floor is set just under half the smallest measurement of its artifact:
// 4 MiB is 40% of 10,392,093 and 2 MiB is 44% of 4,777,012. That leaves a
// leaner future build ample room while still sitting millions of bytes above an
// empty or header-only file.
//
// They are floors only. No upper bound is asserted, because a ceiling would be
// a distribution-size policy this project does not have and cannot justify.
export const MIN_APP_PAYLOAD_BYTES = 4 * 1024 * 1024
export const MIN_DMG_BYTES = 2 * 1024 * 1024

// The bundled prompt strings are compared against the plist the repository
// ships, so the text macOS shows a user cannot drift from the tracked source.
export const EXPECTED_USAGE_DESCRIPTIONS = [
  'NSMicrophoneUsageDescription',
  'NSSpeechRecognitionUsageDescription',
]
const SOURCE_INFO_PLIST = ['src-tauri', 'Info.plist']

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
 * Entitlements from `codesign -d --entitlements -`, as a key-to-value map.
 *
 * Recent codesign prints a bracketed dict ("[Key] name" then "[Value]" then a
 * typed leaf such as "[Bool] true"); older versions print XML. Both are read,
 * because a verifier that understood only one would silently find no keys on
 * the other and report an empty set as a pass.
 *
 * The VALUE is parsed, not just the key. `<key>…</key><false/>` grants
 * nothing, and a key whose value leaf is missing or is not a boolean grants
 * nothing either; all three have to be distinguishable from a real grant.
 * Booleans come back as booleans, other leaves as their text, and a key with
 * no readable value as null.
 */
export function parseEntitlements(text) {
  const entitlements = {}

  // XML: the first tag after a <key> is that key's value.
  const xmlPattern = /<key>([^<]+)<\/key>\s*(?:<(true|false)\s*\/>|<(\w+)>([\s\S]*?)<\/\3>|<(\w+)\s*\/>)/g
  for (const match of text.matchAll(xmlPattern)) {
    const key = match[1].trim()
    if (match[2] !== undefined) entitlements[key] = match[2] === 'true'
    else if (match[3] !== undefined) entitlements[key] = match[4]
    else entitlements[key] = match[5]
  }
  // An XML key with no following value tag at all still has to be visible.
  for (const match of text.matchAll(/<key>([^<]+)<\/key>/g)) {
    const key = match[1].trim()
    if (!(key in entitlements)) entitlements[key] = null
  }

  // Bracketed: read forward from each [Key] to the first typed leaf before the
  // next [Key].
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    const keyMatch = line.match(/^\s*\[Key\]\s+(.+?)\s*$/)
    if (!keyMatch) return
    const key = keyMatch[1].trim()
    let value = null
    for (let i = index + 1; i < lines.length; i += 1) {
      if (/^\s*\[Key\]\s+/.test(lines[i])) break
      const leaf = lines[i].match(/^\s*\[(\w+)\]\s*(.*?)\s*$/)
      if (!leaf || leaf[1] === 'Value') continue
      value = leaf[1] === 'Bool' ? leaf[2] === 'true' : leaf[2]
      break
    }
    entitlements[key] = value
  })

  return entitlements
}

/** The entitlement keys alone, sorted. */
export function parseEntitlementKeys(text) {
  return Object.keys(parseEntitlements(text)).sort()
}

/** Every `<key>` / `<string>` pair in a plist, as a plain object. */
export function parsePlistStrings(xml) {
  const values = {}
  for (const match of xml.matchAll(/<key>([^<]+)<\/key>\s*<string>([\s\S]*?)<\/string>/g)) {
    values[match[1].trim()] = match[2].trim()
  }
  return values
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

/** Every regular file under `dir`, recursively. Symlinks are not followed. */
function listFilesRecursively(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listFilesRecursively(full))
    else if (entry.isFile()) found.push(full)
  }
  return found
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
    listFiles = listFilesRecursively,
    fileSize = p => fs.statSync(p).size,
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

  // Size first, because a truncated artifact is the one defect every structural
  // assertion below would report as healthy.
  const appBytes = listFiles(appPath).reduce((total, file) => total + fileSize(file), 0)
  if (appBytes < MIN_APP_PAYLOAD_BYTES) {
    fail(
      `the .app payload is ${appBytes} bytes, below the ${MIN_APP_PAYLOAD_BYTES}-byte floor, so the bundle is empty or truncated`,
      appPath
    )
  }
  const dmgBytes = fileSize(dmgPath)
  if (dmgBytes < MIN_DMG_BYTES) {
    fail(
      `the DMG is ${dmgBytes} bytes, below the ${MIN_DMG_BYTES}-byte floor, so the image is empty or truncated`,
      dmgPath
    )
  }

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

  const entitlements = parseEntitlements(exec('codesign', ['-d', '--entitlements', '-', appPath]).combined)
  const entitlementKeys = Object.keys(entitlements).sort()
  if (!sameSet(entitlementKeys, EXPECTED_ENTITLEMENTS)) {
    fail(
      `the shipped entitlements must be exactly ${EXPECTED_ENTITLEMENTS.join(', ')}`,
      entitlementKeys.join(', ') || '(none)'
    )
  }
  // Presence is not a grant. A key carrying false, a non-boolean, or no value
  // leaf at all authorises nothing, and reporting it as satisfied would be the
  // false pass this assertion exists to prevent.
  for (const key of EXPECTED_ENTITLEMENTS) {
    if (!(key in entitlements)) continue
    if (entitlements[key] !== true) {
      fail(
        `the entitlement ${key} must be set to true`,
        entitlements[key] === null ? '(no value)' : JSON.stringify(entitlements[key])
      )
    }
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
  // The usage descriptions are compared against the plist the repository
  // ships, not merely required to be present: the string macOS shows the user
  // is the claim, and a bundled copy that has drifted from the tracked source
  // is exactly what a presence check cannot see.
  const sourcePlistPath = path.join(repoRoot, ...SOURCE_INFO_PLIST)
  const sourcePlistRelative = SOURCE_INFO_PLIST.join('/')
  let sourceDescriptions = null
  try {
    sourceDescriptions = parsePlistStrings(readText(sourcePlistPath))
  } catch (err) {
    fail(`${sourcePlistRelative} is missing, so the usage descriptions cannot be compared`, err.message)
  }
  for (const key of EXPECTED_USAGE_DESCRIPTIONS) {
    const actual = plistValue(infoPlist, key, exec)
    if (!actual) {
      fail(`Info.plist is missing ${key}, so macOS cannot prompt for the capability`)
      continue
    }
    if (sourceDescriptions === null) continue
    const expected = sourceDescriptions[key]
    if (expected === undefined) {
      fail(`${sourcePlistRelative} declares no ${key} for the bundle to be checked against`)
      continue
    }
    if (actual !== expected) {
      fail(
        `Info.plist ${key} does not match ${sourcePlistRelative}`,
        `bundled ${JSON.stringify(actual)} != expected ${JSON.stringify(expected)}`
      )
    }
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
