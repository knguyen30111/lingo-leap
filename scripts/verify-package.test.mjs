// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  verifyPackage,
  parseArchs,
  parseCodesignFlags,
  parseSignatureMode,
  parseEntitlementKeys,
  parseEntitlements,
  parsePlistStrings,
  EXPECTED_ENTITLEMENTS,
  EXPECTED_USAGE_DESCRIPTIONS,
  MIN_APP_PAYLOAD_BYTES,
  MIN_DMG_BYTES,
} from './verify-package.mjs'

// Recorded output from a real `codesign -dv --verbose=4` run against a bundle
// this repository produced. Parsing this is the part that goes wrong in
// practice, so it is asserted against the real text rather than a paraphrase.
const CODESIGN_DV = [
  'Executable=/tmp/Lingo Leap.app/Contents/MacOS/tran-app',
  'Identifier=com.lingoleap.translator',
  'Format=app bundle with Mach-O thin (arm64)',
  'CodeDirectory v=20500 size=19193 flags=0x10002(adhoc,runtime) hashes=589+7 location=embedded',
  'Hash type=sha256 size=32',
  'CDHash=784f602a761ef215b18ab673439ce9043995100b',
  'Signature=adhoc',
  'Info.plist entries=17',
  'TeamIdentifier=not set',
  'Runtime Version=26.5.0',
  'Sealed Resources version=2 rules=13 files=1',
].join('\n')

const ENTITLEMENTS_BRACKETED = [
  'Executable=/tmp/Lingo Leap.app/Contents/MacOS/tran-app',
  '[Dict]',
  '\t[Key] com.apple.security.device.audio-input',
  '\t[Value]',
  '\t\t[Bool] true',
].join('\n')

const ENTITLEMENTS_XML =
  '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' +
  '<key>com.apple.security.device.audio-input</key><true/></dict></plist>'

const MIC_DESCRIPTION = 'Lingo Leap needs microphone access for voice input'
const SPEECH_DESCRIPTION = 'Lingo Leap uses speech recognition to convert your voice to text'

const SOURCE_INFO_PLIST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '  <key>NSMicrophoneUsageDescription</key>',
  `  <string>${MIC_DESCRIPTION}</string>`,
  '  <key>NSSpeechRecognitionUsageDescription</key>',
  `  <string>${SPEECH_DESCRIPTION}</string>`,
  '</dict>',
  '</plist>',
  '',
].join('\n')

describe('parsers', () => {
  it('reads a single architecture', () => {
    expect(parseArchs('arm64\n')).toEqual(['arm64'])
  })

  it('reads a universal binary as two slices', () => {
    expect(parseArchs('x86_64 arm64\n')).toEqual(['x86_64', 'arm64'])
  })

  it('extracts both code-directory flags', () => {
    expect(parseCodesignFlags(CODESIGN_DV)).toEqual(['adhoc', 'runtime'])
  })

  it('returns no flags when the line is absent', () => {
    expect(parseCodesignFlags('Signature=adhoc')).toEqual([])
  })

  it('reads an adhoc-only flag set without inventing runtime', () => {
    expect(parseCodesignFlags('CodeDirectory v=20500 flags=0x2(adhoc) hashes=1')).toEqual(['adhoc'])
  })

  it('reads the signature mode', () => {
    expect(parseSignatureMode(CODESIGN_DV)).toBe('adhoc')
  })

  it('returns null when no signature line is present', () => {
    expect(parseSignatureMode('Identifier=x')).toBeNull()
  })

  // A verifier that understood only one spelling would find no keys on the
  // other and report an empty set as a pass.
  it('reads entitlement keys from the bracketed dict form', () => {
    expect(parseEntitlementKeys(ENTITLEMENTS_BRACKETED)).toEqual(EXPECTED_ENTITLEMENTS)
  })

  it('reads entitlement keys from the XML form', () => {
    expect(parseEntitlementKeys(ENTITLEMENTS_XML)).toEqual(EXPECTED_ENTITLEMENTS)
  })

  // A key present with a false or malformed value grants nothing, so a
  // verifier that only looked for the key would report it as satisfied.
  it('reads the boolean value from the bracketed dict form', () => {
    expect(parseEntitlements(ENTITLEMENTS_BRACKETED)).toEqual({
      'com.apple.security.device.audio-input': true,
    })
  })

  it('reads the boolean value from the XML form', () => {
    expect(parseEntitlements(ENTITLEMENTS_XML)).toEqual({
      'com.apple.security.device.audio-input': true,
    })
  })

  it('reads a false bracketed value as false rather than as present', () => {
    const text = ENTITLEMENTS_BRACKETED.replace('[Bool] true', '[Bool] false')

    expect(parseEntitlements(text)).toEqual({ 'com.apple.security.device.audio-input': false })
  })

  it('reads a false XML value as false', () => {
    const text = ENTITLEMENTS_XML.replace('<true/>', '<false/>')

    expect(parseEntitlements(text)).toEqual({ 'com.apple.security.device.audio-input': false })
  })

  it('reads a non-boolean XML value as the string it is', () => {
    const text = ENTITLEMENTS_XML.replace('<true/>', '<string>true</string>')

    expect(parseEntitlements(text)).toEqual({ 'com.apple.security.device.audio-input': 'true' })
  })

  it('reads a bracketed key whose value leaf is absent as null', () => {
    const text = ENTITLEMENTS_BRACKETED.replace('\n\t\t[Bool] true', '')

    expect(parseEntitlements(text)).toEqual({ 'com.apple.security.device.audio-input': null })
  })

  it('reads every key when more than one is present', () => {
    const text = ENTITLEMENTS_BRACKETED + '\n\t[Key] com.apple.security.cs.allow-jit\n\t[Value]\n\t\t[Bool] true'
    expect(parseEntitlementKeys(text)).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.device.audio-input',
    ])
  })

  it('reads usage descriptions out of the source Info.plist', () => {
    expect(parsePlistStrings(SOURCE_INFO_PLIST)).toEqual({
      NSMicrophoneUsageDescription: MIC_DESCRIPTION,
      NSSpeechRecognitionUsageDescription: SPEECH_DESCRIPTION,
    })
  })

  it('returns no entries for a plist with no string values', () => {
    expect(parsePlistStrings('<plist><dict></dict></plist>')).toEqual({})
  })

  it('names the usage descriptions the bundle has to carry', () => {
    expect(EXPECTED_USAGE_DESCRIPTIONS).toEqual([
      'NSMicrophoneUsageDescription',
      'NSSpeechRecognitionUsageDescription',
    ])
  })
})

// --- structural verification against a fixture bundle tree -----------------

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-package-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

const VERSION = '1.1.0'
const IDENTIFIER = 'com.lingoleap.translator'
const CSP = "default-src 'self'; object-src 'none'"

function buildFixture(overrides = {}) {
  const bundleRoot = path.join(fixture, 'bundle')
  const appName = overrides.appName ?? 'Lingo Leap.app'
  const appPath = path.join(bundleRoot, 'macos', appName)
  fs.mkdirSync(path.join(appPath, 'Contents', 'MacOS'), { recursive: true })
  fs.mkdirSync(path.join(bundleRoot, 'dmg'), { recursive: true })

  const pad = overrides.padToBytes ?? {}
  const body = (text, bytes) => (bytes ? Buffer.alloc(bytes, 'x') : Buffer.from(text))

  for (const name of overrides.dmgNames ?? [`Lingo Leap_${VERSION}_aarch64.dmg`]) {
    fs.writeFileSync(path.join(bundleRoot, 'dmg', name), body('dmg', pad.dmg))
  }
  if (overrides.executable !== false) {
    const bin = path.join(appPath, 'Contents', 'MacOS', overrides.executableName ?? 'tran-app')
    fs.writeFileSync(bin, body('binary', pad.app))
    fs.chmodSync(bin, 0o755)
  }
  fs.writeFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'plist')

  fs.mkdirSync(path.join(fixture, 'src-tauri'), { recursive: true })
  fs.writeFileSync(
    path.join(fixture, 'src-tauri', 'tauri.conf.json'),
    JSON.stringify({
      version: overrides.configVersion ?? VERSION,
      identifier: IDENTIFIER,
      // `??` would swallow an explicitly null csp, which is the case one test
      // needs to build.
      app: { security: { csp: 'csp' in overrides ? overrides.csp : CSP } },
      bundle: { macOS: { minimumSystemVersion: '14.0' } },
    })
  )
  if (overrides.sourceInfoPlist !== false) {
    fs.writeFileSync(
      path.join(fixture, 'src-tauri', 'Info.plist'),
      overrides.sourceInfoPlist ?? SOURCE_INFO_PLIST
    )
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ version: overrides.manifestVersion ?? VERSION })
  )
  return bundleRoot
}

/** A tool double answering each command with healthy output by default. */
function toolDouble(overrides = {}) {
  const plistValues = {
    CFBundleIdentifier: IDENTIFIER,
    CFBundleShortVersionString: VERSION,
    CFBundleVersion: VERSION,
    LSMinimumSystemVersion: '14.0',
    NSMicrophoneUsageDescription: MIC_DESCRIPTION,
    NSSpeechRecognitionUsageDescription: SPEECH_DESCRIPTION,
    ...(overrides.plist ?? {}),
  }
  return (cmd, args) => {
    const ok = (stdout = '') => ({ status: 0, stdout, stderr: '', combined: stdout })
    if (cmd === 'lipo') return ok(overrides.archs ?? 'arm64\n')
    if (cmd === 'strings') return ok(overrides.strings ?? `junk ${CSP} junk`)
    if (cmd === 'hdiutil') return overrides.hdiutilFails
      ? { status: 1, stdout: '', stderr: 'checksum invalid', combined: 'checksum invalid' }
      : ok('verified')
    if (cmd === '/usr/libexec/PlistBuddy') {
      const key = args[1].replace('Print :', '')
      const value = plistValues[key]
      return value === undefined
        ? { status: 1, stdout: '', stderr: 'Does Not Exist', combined: 'Does Not Exist' }
        : ok(`${value}\n`)
    }
    if (cmd === 'codesign') {
      if (args[0] === '--verify') {
        return overrides.verifyFails
          ? { status: 1, stdout: '', stderr: 'code object is not signed', combined: 'code object is not signed' }
          : ok('valid on disk')
      }
      if (args.includes('--entitlements')) return ok(overrides.entitlements ?? ENTITLEMENTS_BRACKETED)
      return ok(overrides.codesignDv ?? CODESIGN_DV)
    }
    return ok()
  }
}

// Sizes measured on real arm64 artifacts this repository produced: the app
// payload of a 1.1.0 bundle built under CI=true, and the DMG published under
// the v1.1.0 release. The fixture tree holds a few bytes per file, so the
// healthy sizes are injected rather than written out.
const REAL_APP_PAYLOAD_BYTES = 10_392_093
const REAL_DMG_BYTES = 5_802_624
const PAYLOAD_MARKER = '<app payload>'

/**
 * Size doubles. `realSizes: true` drops them so the default `node:fs`
 * implementation measures the fixture tree on disk.
 */
function sizeDeps(overrides) {
  if (overrides.realSizes) return {}
  const appBytes = overrides.appBytes ?? REAL_APP_PAYLOAD_BYTES
  const dmgBytes = overrides.dmgBytes ?? REAL_DMG_BYTES
  return {
    listFiles: () => [PAYLOAD_MARKER],
    fileSize: target => (target === PAYLOAD_MARKER ? appBytes : dmgBytes),
  }
}

function run(bundleRoot, toolOverrides = {}) {
  return verifyPackage(bundleRoot, {
    exec: toolDouble(toolOverrides),
    repoRoot: fixture,
    ...sizeDeps(toolOverrides),
  })
}

function messages(findings) {
  return findings.map(f => f.message).join('\n')
}

describe('verifyPackage', () => {
  it('reports nothing for a healthy bundle', () => {
    expect(run(buildFixture())).toEqual([])
  })

  it('reports a missing bundle root', () => {
    expect(messages(run(path.join(fixture, 'nope')))).toContain('bundle root does not exist')
  })

  // Two DMGs means a stale artifact is present and every checksum is ambiguous.
  it('reports two DMGs', () => {
    const root = buildFixture({ dmgNames: [`Lingo Leap_${VERSION}_aarch64.dmg`, 'Lingo Leap_0.1.0_aarch64.dmg'] })

    expect(messages(run(root))).toContain('expected exactly one .dmg')
  })

  it('reports no DMG at all', () => {
    expect(messages(run(buildFixture({ dmgNames: [] })))).toContain('expected exactly one .dmg')
  })

  // The Cargo package name, not the product name.
  it('reports an executable named after the product instead of the crate', () => {
    const root = buildFixture({ executableName: 'Lingo Leap' })

    expect(messages(run(root))).toContain('bundle executable not found at Contents/MacOS/tran-app')
  })

  it('reports a universal binary as a second slice', () => {
    expect(messages(run(buildFixture(), { archs: 'x86_64 arm64\n' })))
      .toContain('the executable must be arm64 only')
  })

  it('reports an x86_64-only binary', () => {
    expect(messages(run(buildFixture(), { archs: 'x86_64\n' })))
      .toContain('the executable must be arm64 only')
  })

  it('reports a failed codesign verification', () => {
    expect(messages(run(buildFixture(), { verifyFails: true })))
      .toContain('codesign --verify --deep --strict failed')
  })

  it('reports a signature that is not adhoc', () => {
    const dv = CODESIGN_DV.replace('Signature=adhoc', 'Signature=Developer ID Application: Someone')

    expect(messages(run(buildFixture(), { codesignDv: dv })))
      .toContain('the signature mode must be adhoc')
  })

  // The absence of runtime is a failure, not a note.
  it('reports a bundle signed without the Hardened Runtime', () => {
    const dv = CODESIGN_DV.replace('flags=0x10002(adhoc,runtime)', 'flags=0x2(adhoc)')

    expect(messages(run(buildFixture(), { codesignDv: dv })))
      .toContain('the Hardened Runtime is not in force')
  })

  it('reports an extra entitlement', () => {
    const entitlements = ENTITLEMENTS_BRACKETED + '\n\t[Key] com.apple.security.cs.allow-jit\n\t[Value]\n\t\t[Bool] true'

    expect(messages(run(buildFixture(), { entitlements })))
      .toContain('the shipped entitlements must be exactly com.apple.security.device.audio-input')
  })

  it('reports an empty entitlement set', () => {
    expect(messages(run(buildFixture(), { entitlements: 'Executable=/x\n' })))
      .toContain('the shipped entitlements must be exactly')
  })

  it.each([
    ['CFBundleIdentifier', 'com.example.other'],
    ['CFBundleShortVersionString', '0.1.0'],
    ['CFBundleVersion', '0.1.0'],
    ['LSMinimumSystemVersion', '12.0'],
  ])('reports a bundled %s that disagrees with the manifest', (key, wrong) => {
    expect(messages(run(buildFixture(), { plist: { [key]: wrong } })))
      .toContain(`Info.plist ${key} does not match the manifest`)
  })

  it.each(['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'])(
    'reports a missing %s',
    key => {
      expect(messages(run(buildFixture(), { plist: { [key]: undefined } })))
        .toContain(`Info.plist is missing ${key}`)
    }
  )

  // Presence alone would let the bundled prompt text drift away from the
  // source of truth the repository ships.
  it.each(['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'])(
    'reports a bundled %s that does not match the source Info.plist',
    key => {
      expect(messages(run(buildFixture(), { plist: { [key]: 'something else' } })))
        .toContain(`Info.plist ${key} does not match src-tauri/Info.plist`)
    }
  )

  it('reports a source Info.plist that declares no usage description', () => {
    const root = buildFixture({ sourceInfoPlist: '<plist><dict></dict></plist>' })

    expect(messages(run(root)))
      .toContain('src-tauri/Info.plist declares no NSMicrophoneUsageDescription')
  })

  it('reports an absent source Info.plist rather than skipping the comparison', () => {
    const root = buildFixture({ sourceInfoPlist: false })

    expect(messages(run(root))).toContain('src-tauri/Info.plist is missing')
  })

  // The entitlement has to be granted, not merely listed.
  it('reports the expected entitlement present but set to false', () => {
    const entitlements = ENTITLEMENTS_BRACKETED.replace('[Bool] true', '[Bool] false')

    expect(messages(run(buildFixture(), { entitlements })))
      .toContain('com.apple.security.device.audio-input must be set to true')
  })

  it('reports the expected entitlement present but set to false in the XML form', () => {
    const entitlements = ENTITLEMENTS_XML.replace('<true/>', '<false/>')

    expect(messages(run(buildFixture(), { entitlements })))
      .toContain('com.apple.security.device.audio-input must be set to true')
  })

  it('reports the expected entitlement present with a string value instead of a boolean', () => {
    const entitlements = ENTITLEMENTS_XML.replace('<true/>', '<string>true</string>')

    expect(messages(run(buildFixture(), { entitlements })))
      .toContain('com.apple.security.device.audio-input must be set to true')
  })

  it('reports the expected entitlement present with no value leaf at all', () => {
    const entitlements = ENTITLEMENTS_BRACKETED.replace('\n\t\t[Bool] true', '')

    expect(messages(run(buildFixture(), { entitlements })))
      .toContain('com.apple.security.device.audio-input must be set to true')
  })

  it('accepts the XML form of a granted entitlement', () => {
    expect(run(buildFixture(), { entitlements: ENTITLEMENTS_XML })).toEqual([])
  })

  it('reports manifests that disagree about the version', () => {
    expect(messages(run(buildFixture({ manifestVersion: '1.0.0' }))))
      .toContain('package.json and tauri.conf.json disagree about the version')
  })

  it('reports a CSP absent from the executable', () => {
    expect(messages(run(buildFixture(), { strings: 'no policy here' })))
      .toContain('the configured CSP string is not present in the executable')
  })

  it('reports a configuration with no CSP to look for', () => {
    expect(messages(run(buildFixture({ csp: null }))))
      .toContain('declares no CSP to look for')
  })

  it('reports a DMG that fails hdiutil verify', () => {
    expect(messages(run(buildFixture(), { hdiutilFails: true })))
      .toContain('hdiutil verify failed on the DMG')
  })

  // Artifact size. A build that produces a zero-length or truncated artifact
  // satisfies every structural assertion above — the names are right, the
  // plist is right, the signature is right — so a floor is the only thing that
  // sees it.
  it('reports an app payload below the floor', () => {
    expect(messages(run(buildFixture(), { appBytes: 1024 })))
      .toContain(`the .app payload is 1024 bytes, below the ${MIN_APP_PAYLOAD_BYTES}-byte floor`)
  })

  it('reports an empty app payload', () => {
    expect(messages(run(buildFixture(), { appBytes: 0 })))
      .toContain(`the .app payload is 0 bytes, below the ${MIN_APP_PAYLOAD_BYTES}-byte floor`)
  })

  it('reports a DMG below the floor', () => {
    expect(messages(run(buildFixture(), { dmgBytes: 4096 })))
      .toContain(`the DMG is 4096 bytes, below the ${MIN_DMG_BYTES}-byte floor`)
  })

  it('reports a zero-length DMG', () => {
    expect(messages(run(buildFixture(), { dmgBytes: 0 })))
      .toContain(`the DMG is 0 bytes, below the ${MIN_DMG_BYTES}-byte floor`)
  })

  // The floor is a floor, not a window: the measured value is allowed to sit
  // on it, and nothing above it is ever reported.
  it('accepts artifacts exactly at both floors', () => {
    expect(run(buildFixture(), { appBytes: MIN_APP_PAYLOAD_BYTES, dmgBytes: MIN_DMG_BYTES })).toEqual([])
  })

  it('asserts no upper bound on either artifact', () => {
    const huge = 4 * 1024 * 1024 * 1024

    expect(run(buildFixture(), { appBytes: huge, dmgBytes: huge })).toEqual([])
  })

  // The floors have to hold against real measurements, or they would fail a
  // healthy build.
  it('keeps both floors below the real measured artifacts', () => {
    expect(MIN_APP_PAYLOAD_BYTES).toBeLessThan(REAL_APP_PAYLOAD_BYTES)
    expect(MIN_DMG_BYTES).toBeLessThan(REAL_DMG_BYTES)
    expect(MIN_APP_PAYLOAD_BYTES).toBeGreaterThan(0)
    expect(MIN_DMG_BYTES).toBeGreaterThan(0)
  })

  // Without the doubles, the sizes come from the filesystem. The fixture tree
  // holds a handful of bytes, so both floors must report against it.
  it('measures the real tree when no size double is injected', () => {
    const found = messages(run(buildFixture(), { realSizes: true }))

    expect(found).toContain('the .app payload is')
    expect(found).toContain('below the')
    expect(found).toContain('the DMG is')
  })

  it('measures a padded real tree as satisfying both floors', () => {
    const root = buildFixture({ padToBytes: { app: MIN_APP_PAYLOAD_BYTES, dmg: MIN_DMG_BYTES } })

    expect(run(root, { realSizes: true })).toEqual([])
  })

  it('reports a DMG filename that does not carry the version', () => {
    expect(messages(run(buildFixture({ dmgNames: ['Lingo Leap_0.1.0_aarch64.dmg'] }))))
      .toContain('the DMG filename does not contain the agreed version')
  })
})
