// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { entitlementsRule, declaredKeys, stripComments } from './entitlements.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'entitlements-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
}

function plist(body) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    body,
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

const MINIMAL_ENTITLEMENTS = plist([
  '  <!-- Allow microphone access for speech-to-text -->',
  '  <key>com.apple.security.device.audio-input</key>',
  '  <true/>',
].join('\n'))

const CURRENT_ENTITLEMENTS = plist([
  '  <key>com.apple.security.device.audio-input</key>',
  '  <true/>',
  '  <key>com.apple.security.network.client</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-jit</key>',
  '  <true/>',
  '  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
  '  <true/>',
].join('\n'))

const GOOD_INFO = plist([
  '  <key>NSMicrophoneUsageDescription</key>',
  '  <string>Lingo Leap needs microphone access for voice input</string>',
  '  <key>NSSpeechRecognitionUsageDescription</key>',
  '  <string>Lingo Leap uses speech recognition to convert your voice to text</string>',
].join('\n'))

function seed(overrides = {}) {
  write('src-tauri/Entitlements.plist', overrides.entitlements ?? MINIMAL_ENTITLEMENTS)
  write('src-tauri/Info.plist', overrides.info ?? GOOD_INFO)
  write('src-tauri/tauri.conf.json', {
    bundle: {
      macOS: overrides.macOS ?? {
        entitlements: 'Entitlements.plist',
        hardenedRuntime: true,
        signingIdentity: '-',
      },
    },
  })
}

function run() {
  return entitlementsRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

describe('entitlements rule', () => {
  it('reports nothing for the intended single-key plist', () => {
    seed()

    expect(run()).toEqual([])
  })

  // The state this phase starts from.
  it('reports all three unnecessary keys in the current plist', () => {
    seed({ entitlements: CURRENT_ENTITLEMENTS })

    const text = messages()
    expect(text).toContain('declares com.apple.security.network.client')
    expect(text).toContain('declares com.apple.security.cs.allow-jit')
    expect(text).toContain('declares com.apple.security.cs.allow-unsigned-executable-memory')
    expect(text).toContain('must be exactly the microphone entitlement')
  })

  // The allowlist covers neighbouring exceptions, not only the two present today.
  it.each([
    'com.apple.security.cs.allow-dyld-environment-variables',
    'com.apple.security.cs.disable-library-validation',
    'com.apple.security.cs.disable-executable-page-protection',
  ])('reports %s', key => {
    seed({
      entitlements: plist([
        '  <key>com.apple.security.device.audio-input</key>',
        '  <true/>',
        `  <key>${key}</key>`,
        '  <true/>',
      ].join('\n')),
    })

    expect(messages()).toContain(`declares ${key}`)
  })

  it('reports a missing microphone entitlement', () => {
    seed({ entitlements: plist('  <key>com.apple.security.cs.allow-jit</key>\n  <true/>') })

    expect(messages()).toContain('must be exactly the microphone entitlement')
  })

  it('reports a microphone entitlement set to false', () => {
    seed({
      entitlements: plist('  <key>com.apple.security.device.audio-input</key>\n  <false/>'),
    })

    expect(messages()).toContain('com.apple.security.device.audio-input must be <true/>')
  })

  // A commented-out key is not a declaration.
  it('does not count a commented-out dangerous key as declared', () => {
    seed({
      entitlements: plist([
        '  <key>com.apple.security.device.audio-input</key>',
        '  <true/>',
        '  <!-- <key>com.apple.security.cs.allow-jit</key><true/> -->',
      ].join('\n')),
    })

    expect(run()).toEqual([])
  })

  // ...and equally, commenting one out does not satisfy a required key.
  it('does not let a commented-out usage description satisfy the requirement', () => {
    seed({
      info: plist([
        '  <key>NSMicrophoneUsageDescription</key>',
        '  <string>needed</string>',
        '  <!-- <key>NSSpeechRecognitionUsageDescription</key><string>x</string> -->',
      ].join('\n')),
    })

    expect(messages()).toContain('declares no NSSpeechRecognitionUsageDescription')
  })

  it.each(['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'])(
    'reports a missing %s',
    key => {
      const kept = key === 'NSMicrophoneUsageDescription'
        ? 'NSSpeechRecognitionUsageDescription'
        : 'NSMicrophoneUsageDescription'
      seed({ info: plist(`  <key>${kept}</key>\n  <string>kept</string>`) })

      expect(messages()).toContain(`declares no ${key}`)
    }
  )

  it('reports an empty usage description string', () => {
    seed({
      info: plist([
        '  <key>NSMicrophoneUsageDescription</key>',
        '  <string></string>',
        '  <key>NSSpeechRecognitionUsageDescription</key>',
        '  <string>fine</string>',
      ].join('\n')),
    })

    expect(messages()).toContain('NSMicrophoneUsageDescription must have a non-empty string value')
  })

  it('reports an absent bundle.macOS.entitlements path', () => {
    seed({ macOS: { hardenedRuntime: true } })

    expect(messages()).toContain('bundle.macOS.entitlements must point at Entitlements.plist')
  })

  it('reports an entitlements path pointing somewhere else', () => {
    seed({ macOS: { entitlements: 'Other.plist', hardenedRuntime: true } })

    expect(messages()).toContain('bundle.macOS.entitlements must point at Entitlements.plist')
  })

  // Assertion 6 is what stops the Hardened Runtime being traded away later.
  it('reports an absent hardenedRuntime even though Tauri defaults it to true', () => {
    seed({ macOS: { entitlements: 'Entitlements.plist' } })

    expect(messages()).toContain('hardenedRuntime must be stated explicitly as true')
  })

  it('reports hardenedRuntime set to false', () => {
    seed({ macOS: { entitlements: 'Entitlements.plist', hardenedRuntime: false } })

    expect(messages()).toContain('hardenedRuntime must be true')
  })

  it('accepts hardenedRuntime set to true', () => {
    seed({ macOS: { entitlements: 'Entitlements.plist', hardenedRuntime: true } })

    expect(run()).toEqual([])
  })

  it('reports a missing entitlements file', () => {
    seed()
    fs.rmSync(path.join(fixture, 'src-tauri/Entitlements.plist'))

    expect(messages()).toContain('src-tauri/Entitlements.plist is missing')
  })
})

describe('plist reading helpers', () => {
  it('strips XML comments', () => {
    expect(stripComments('a<!-- b -->c')).toBe('ac')
  })

  it('lists declared keys in order', () => {
    expect(declaredKeys('<key>one</key><string>x</string><key>two</key>')).toEqual(['one', 'two'])
  })

  it('ignores keys inside comments', () => {
    expect(declaredKeys('<!-- <key>hidden</key> --><key>shown</key>')).toEqual(['shown'])
  })
})
