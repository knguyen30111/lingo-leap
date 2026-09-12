// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { nativeAuthorityRule, ALLOWED_PERMISSIONS } from './native-authority.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'native-authority-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
}

const CLEAN_CARGO = [
  '[package]',
  'name = "tran-app"',
  '',
  '[build-dependencies]',
  'tauri-build = { version = "2", features = [] }',
  '',
  '[dependencies]',
  'tauri = { version = "2", features = ["tray-icon"] }',
  'tauri-plugin-log = "2"',
  'log = "0.4"',
  '',
  '[target.\'cfg(target_os = "macos")\'.dependencies]',
  'objc = "0.2"',
  '',
  '[target.\'cfg(not(any(target_os = "android", target_os = "ios")))\'.dependencies]',
  'tauri-plugin-clipboard-manager = "2"',
  '',
].join('\n')

const CLEAN_LIB_RS = [
  'pub fn run() {',
  '    tauri::Builder::default()',
  '        .plugin(tauri_plugin_clipboard_manager::init())',
  '        .run(tauri::generate_context!());',
  '}',
  '',
].join('\n')

function seedCleanFixture(overrides = {}) {
  write('src-tauri/capabilities/default.json', {
    identifier: 'default',
    windows: ['main'],
    permissions: overrides.permissions ?? ALLOWED_PERMISSIONS,
  })
  write('src-tauri/Cargo.toml', overrides.cargo ?? CLEAN_CARGO)
  write('src-tauri/src/lib.rs', overrides.libRs ?? CLEAN_LIB_RS)
  write('package.json', {
    dependencies: overrides.npmDependencies ?? { '@tauri-apps/api': '2.11.1', react: '^19.2.3' },
  })
  write('src/lib/copy-output.ts', overrides.source ?? "import { writeText } from '@tauri-apps/plugin-clipboard-manager'\n")
}

function run() {
  return nativeAuthorityRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

describe('native-authority rule', () => {
  it('reports nothing when the surface is exactly the permitted one', () => {
    seedCleanFixture()

    expect(run()).toEqual([])
  })

  it('is insensitive to permission ordering', () => {
    seedCleanFixture({ permissions: [...ALLOWED_PERMISSIONS].reverse() })

    expect(run()).toEqual([])
  })

  // Assertion 1
  it('names an extra permission', () => {
    seedCleanFixture({ permissions: [...ALLOWED_PERMISSIONS, 'core:app:allow-app-hide'] })

    const entries = run()
    const exact = entries.find(e => e.message.includes('exactly the five permissions'))
    expect(exact).toBeDefined()
    expect(exact.evidence).toContain('unexpected: core:app:allow-app-hide')
  })

  it('names a missing permission', () => {
    seedCleanFixture({ permissions: ALLOWED_PERMISSIONS.filter(p => p !== 'core:window:allow-hide') })

    const entries = run()
    const exact = entries.find(e => e.message.includes('exactly the five permissions'))
    expect(exact.evidence).toContain('missing: core:window:allow-hide')
  })

  // Assertion 2
  it('reports a surviving desktop capability file', () => {
    seedCleanFixture()
    write('src-tauri/capabilities/desktop.json', {
      identifier: 'desktop-capability',
      permissions: ['global-shortcut:default', 'positioner:default'],
    })

    expect(messages()).toContain('src-tauri/capabilities/desktop.json')
  })

  // Assertion 3 — checked across every capability file, not just the default one
  it.each([
    ['core:default', 'core:default'],
    ['shell:allow-open', 'shell:allow-open'],
    ['global-shortcut:allow-register', 'global-shortcut:allow-register'],
    ['positioner:default', 'positioner:default'],
    ['clipboard-manager:allow-read-text', 'clipboard-manager:allow-read-text'],
  ])('reports %s wherever it appears', (_label, permission) => {
    seedCleanFixture({ permissions: [...ALLOWED_PERMISSIONS, permission] })

    expect(messages()).toContain(`grants ${permission}`)
  })

  it('reports a forbidden permission in a non-default capability file', () => {
    seedCleanFixture()
    write('src-tauri/capabilities/extra.json', { identifier: 'extra', permissions: ['shell:allow-open'] })

    expect(messages()).toContain('src-tauri/capabilities/extra.json grants shell:allow-open')
  })

  // Assertion 4
  it.each(['tauri-plugin-shell', 'reqwest', 'tokio', 'serde', 'serde_json'])(
    'reports %s declared in the main dependency table',
    dependency => {
      seedCleanFixture({ cargo: CLEAN_CARGO.replace('log = "0.4"', `log = "0.4"\n${dependency} = "1"`) })

      expect(messages()).toContain(`declares ${dependency} as a direct dependency`)
    }
  )

  it('reports a forbidden dependency in a cfg-gated dependency table', () => {
    seedCleanFixture({
      cargo: CLEAN_CARGO.replace(
        'tauri-plugin-clipboard-manager = "2"',
        'tauri-plugin-clipboard-manager = "2"\ntauri-plugin-positioner = "2"'
      ),
    })

    expect(messages()).toContain('declares tauri-plugin-positioner as a direct dependency')
  })

  // tauri-build is legitimately a build dependency and must not be reported.
  it('does not report build-dependencies', () => {
    seedCleanFixture({
      cargo: CLEAN_CARGO.replace(
        'tauri-build = { version = "2", features = [] }',
        'tauri-build = { version = "2", features = [] }\nserde = "1"'
      ),
    })

    expect(messages()).not.toContain('declares serde as a direct dependency')
  })

  // Assertion 5
  it.each(['tauri_plugin_shell', 'tauri_plugin_global_shortcut', 'tauri_plugin_positioner'])(
    'reports %s still registered in the Rust entry point',
    symbol => {
      seedCleanFixture({
        libRs: CLEAN_LIB_RS.replace(
          '        .plugin(tauri_plugin_clipboard_manager::init())',
          `        .plugin(${symbol}::init())\n        .plugin(tauri_plugin_clipboard_manager::init())`
        ),
      })

      expect(messages()).toContain(`still registers ${symbol}`)
    }
  )

  // Assertion 6
  it.each([
    '@tauri-apps/plugin-shell',
    '@tauri-apps/plugin-global-shortcut',
    '@tauri-apps/plugin-positioner',
  ])('reports %s in package.json dependencies', name => {
    seedCleanFixture({ npmDependencies: { '@tauri-apps/api': '2.11.1', [name]: '2.0.0' } })

    expect(messages()).toContain(`package.json depends on ${name}`)
  })

  // Assertion 7
  it('reports a source file importing a removed plugin', () => {
    seedCleanFixture({ source: "import { open } from '@tauri-apps/plugin-shell'\n" })

    expect(messages()).toContain('src/lib/copy-output.ts references @tauri-apps/plugin-shell')
  })

  it('reports a source file calling clipboard readText', () => {
    seedCleanFixture({
      source: "import { readText } from '@tauri-apps/plugin-clipboard-manager'\n",
    })

    expect(messages()).toContain('references clipboard readText')
  })

  // test-setup.ts is excluded from the source sweep only by being a real source
  // file; a mock there is still a reference the rule must see.
  it('sees a readText mock in the shared test setup', () => {
    seedCleanFixture()
    write('src/test-setup.ts', 'vi.mock("x", () => ({ readText: vi.fn() }))\n')

    expect(messages()).toContain('references clipboard readText')
  })

  it('does not sweep .test.ts files', () => {
    seedCleanFixture()
    write('src/lib/copy-output.test.ts', "import { readText } from '@tauri-apps/plugin-shell'\n")

    const text = messages()
    expect(text).not.toContain('copy-output.test.ts')
  })

  it('reports a missing default capability file', () => {
    seedCleanFixture()
    fs.rmSync(path.join(fixture, 'src-tauri/capabilities/default.json'))

    expect(messages()).toContain('src-tauri/capabilities/default.json is missing')
  })
})
