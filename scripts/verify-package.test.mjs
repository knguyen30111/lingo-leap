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
  EXPECTED_ENTITLEMENTS,
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

  it('reads every key when more than one is present', () => {
    const text = ENTITLEMENTS_BRACKETED + '\n\t[Key] com.apple.security.cs.allow-jit\n\t[Value]\n\t\t[Bool] true'
    expect(parseEntitlementKeys(text)).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.device.audio-input',
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

  for (const name of overrides.dmgNames ?? [`Lingo Leap_${VERSION}_aarch64.dmg`]) {
    fs.writeFileSync(path.join(bundleRoot, 'dmg', name), 'dmg')
  }
  if (overrides.executable !== false) {
    const bin = path.join(appPath, 'Contents', 'MacOS', overrides.executableName ?? 'tran-app')
    fs.writeFileSync(bin, 'binary')
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
    NSMicrophoneUsageDescription: 'mic',
    NSSpeechRecognitionUsageDescription: 'speech',
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

function run(bundleRoot, toolOverrides = {}) {
  return verifyPackage(bundleRoot, { exec: toolDouble(toolOverrides), repoRoot: fixture })
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

  it('reports a DMG filename that does not carry the version', () => {
    expect(messages(run(buildFixture({ dmgNames: ['Lingo Leap_0.1.0_aarch64.dmg'] }))))
      .toContain('the DMG filename does not contain the agreed version')
  })
})
