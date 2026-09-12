// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { releaseIdentityRule, resolveTagContext } from './release-identity.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'release-identity-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
}

function cargoToml(overrides = {}) {
  return [
    '[package]',
    'name = "tran-app"',
    `version = "${overrides.version ?? '1.1.0'}"`,
    'description = "macOS translation app"',
    `authors = ${overrides.authors ?? '["Lingo Leap contributors"]'}`,
    'license = "MIT"',
    `repository = ${overrides.repository ?? '"https://github.com/knguyen30111/lingo-leap"'}`,
    'edition = "2021"',
    '',
    '[dependencies]',
    'tauri = { version = "2" }',
    '',
  ].join('\n')
}

function cargoLock(version = '1.1.0') {
  return [
    '[[package]]',
    'name = "tauri"',
    'version = "2.9.1"',
    '',
    '[[package]]',
    'name = "tran-app"',
    `version = "${version}"`,
    'dependencies = [',
    ' "tauri",',
    ']',
    '',
  ].join('\n')
}

function seed(overrides = {}) {
  const version = overrides.version ?? '1.1.0'
  write('package.json', { name: 'lingo-leap', version: overrides.packageVersion ?? version })
  write('package-lock.json', {
    name: 'lingo-leap',
    version: overrides.lockRootVersion ?? version,
    packages: { '': { name: 'lingo-leap', version: overrides.lockPackagesVersion ?? version } },
  })
  write('src-tauri/tauri.conf.json', {
    version: overrides.tauriVersion ?? version,
    bundle: { macOS: overrides.macOS ?? { entitlements: 'Entitlements.plist', hardenedRuntime: true, minimumSystemVersion: '14.0', signingIdentity: '-' } },
  })
  write('src-tauri/Cargo.toml', cargoToml({ version: overrides.cargoVersion ?? version, ...overrides.cargo }))
  write('src-tauri/Cargo.lock', cargoLock(overrides.cargoLockVersion ?? version))
  write('README.md', overrides.readme ?? '# Lingo Leap\n\n- **macOS** 14.0+ required\n')
}

function run({ argv = [], env = {} } = {}) {
  const notes = []
  const entries = releaseIdentityRule.check({
    ...createRepo(fixture),
    root: fixture,
    argv,
    env,
    info: line => notes.push(line),
  })
  return { entries, notes, messages: entries.map(e => e.message).join('\n') }
}

describe('release-identity version agreement', () => {
  it('reports nothing when all six authorities agree', () => {
    seed()

    expect(run().entries).toEqual([])
  })

  // The state this phase starts from.
  it('names each disagreeing authority in the current spread', () => {
    seed({ packageVersion: '1.0.0', lockRootVersion: '1.0.0', lockPackagesVersion: '1.0.0', tauriVersion: '0.1.0', cargoVersion: '0.1.0', cargoLockVersion: '0.1.0' })

    const text = run().messages
    expect(text).toContain('disagreeing with the other version authorities')
  })

  it.each([
    ['packageVersion', 'package.json version'],
    ['tauriVersion', 'src-tauri/tauri.conf.json version'],
    ['cargoVersion', 'src-tauri/Cargo.toml [package].version'],
    ['cargoLockVersion', 'src-tauri/Cargo.lock tran-app version'],
    ['lockRootVersion', 'package-lock.json root version'],
    ['lockPackagesVersion', 'package-lock.json packages[""].version'],
  ])('reports %s when it alone disagrees', (key, label) => {
    seed({ [key]: '9.9.9' })

    expect(run().messages).toContain(`${label} is 9.9.9, disagreeing`)
  })

  it.each(['1.1.0-rc1', '1.1.0+build', 'v1.1.0', '1.1'])('rejects %s as a version authority value', version => {
    seed({ version })

    expect(run().messages).toContain('is not a plain semver version')
  })
})

describe('release-identity bundle and metadata', () => {
  it('reports an absent minimumSystemVersion', () => {
    seed({ macOS: { entitlements: 'Entitlements.plist' } })

    expect(run().messages).toContain('bundle.macOS.minimumSystemVersion must be declared')
  })

  it('reports a minimumSystemVersion that disagrees with the README', () => {
    seed({ readme: '# Lingo Leap\n\n- **macOS** 12.0+ required\n' })

    expect(run().messages).toContain('README.md promises macOS 12.0+ but the bundle declares 14.0')
  })

  it('accepts a README that states the major only', () => {
    seed({ readme: '# Lingo Leap\n\n- **macOS** 14+ required\n' })

    expect(run().entries).toEqual([])
  })

  it('reports an empty exceptionDomain', () => {
    seed({ macOS: { entitlements: 'Entitlements.plist', minimumSystemVersion: '14.0', exceptionDomain: '' } })

    expect(run().messages).toContain('bundle.macOS.exceptionDomain is empty')
  })

  it('accepts an absent exceptionDomain', () => {
    seed()

    expect(run().messages).not.toContain('exceptionDomain')
  })

  it('reports an empty Cargo repository', () => {
    seed({ cargo: { repository: '""' } })

    expect(run().messages).toContain('empty repository')
  })

  it.each(['TranApp', 'TranObserve'])('reports %s in Cargo authors', name => {
    seed({ cargo: { authors: `["${name}"]` } })

    expect(run().messages).toContain(`authors still names ${name}`)
  })
})

describe('release-identity tag preflight', () => {
  it('skips with a visible informational line when there is no tag context', () => {
    seed()

    const { entries, notes } = run()
    expect(entries).toEqual([])
    expect(notes.join('\n')).toContain('tag preflight: skipped')
  })

  it('reports GITHUB_REF_TYPE=tag with GITHUB_REF_NAME unset', () => {
    seed()

    expect(run({ env: { GITHUB_REF_TYPE: 'tag' } }).messages)
      .toContain('GITHUB_REF_NAME is unset or empty')
  })

  it('reports GITHUB_REF_TYPE=tag with an empty GITHUB_REF_NAME', () => {
    seed()

    expect(run({ env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: '' } }).messages)
      .toContain('GITHUB_REF_NAME is unset or empty')
  })

  // These two are separate branches on purpose. An indexOf-based parser turns
  // the bare trailing flag into `undefined` and silently skips; the empty
  // string at least produces a value to reject.
  it('reports a bare --tag as the final argument', () => {
    seed()

    const { entries, messages } = run({ argv: ['--tag'] })
    expect(entries).toHaveLength(1)
    expect(messages).toContain('--tag was supplied with no value')
  })

  it('reports --tag with an explicitly empty value', () => {
    seed()

    const { entries, messages } = run({ argv: ['--tag', ''] })
    expect(entries).toHaveLength(1)
    expect(messages).toContain('--tag was supplied with an empty value')
  })

  it('distinguishes the bare flag from the empty value', () => {
    seed()

    const bare = run({ argv: ['--tag'] }).messages
    const empty = run({ argv: ['--tag', ''] }).messages
    expect(bare).not.toBe(empty)
  })

  // The message must name the missing value, not report the following flag as
  // a malformed tag.
  it('reports --tag followed by another flag as a missing value', () => {
    seed()

    const { messages } = run({ argv: ['--tag', '--root'] })
    expect(messages).toContain('--tag was supplied with no value')
    expect(messages).not.toContain('--root')
  })

  it.each(['v1', 'v1.1', '1.1.0', 'v1.1.0-rc1', 'v1.1.0+build', 'vlatest', 'v1.1.0 '])(
    'reports the malformed tag %s and names the value',
    tag => {
      seed()

      const { entries, messages } = run({ argv: ['--tag', tag] })
      expect(messages).toContain('the tag must be "v" followed by a plain semver version')
      expect(entries[0].evidence).toBe(JSON.stringify(tag))
    }
  )

  it('reports two tag sources that disagree with each other', () => {
    seed()

    const { messages } = run({
      argv: ['--tag', 'v1.1.0'],
      env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.1' },
    })
    expect(messages).toContain('two tag sources disagree')
  })

  it('reports a tag that disagrees with the agreed version', () => {
    seed()

    expect(run({ argv: ['--tag', 'v1.2.0'] }).messages)
      .toContain('tag v1.2.0 does not match the agreed version 1.1.0')
  })

  // A tag is never reported as agreeing with a version that is not itself agreed.
  it('does not claim tag agreement when the versions themselves disagree', () => {
    seed({ packageVersion: '1.0.0' })

    const { messages } = run({ argv: ['--tag', 'v1.1.0'] })
    expect(messages).toContain('disagreeing with the other version authorities')
    expect(messages).not.toContain('does not match the agreed version')
  })

  it('passes for a matching --tag', () => {
    seed()

    const { entries, notes } = run({ argv: ['--tag', 'v1.1.0'] })
    expect(entries).toEqual([])
    expect(notes.join('\n')).toContain('checking v1.1.0 (from --tag)')
  })

  it('passes for a matching GITHUB_REF_NAME', () => {
    seed()

    const { entries, notes } = run({ env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.0' } })
    expect(entries).toEqual([])
    expect(notes.join('\n')).toContain('checking v1.1.0 (from GITHUB_REF_NAME)')
  })

  it('passes when both sources agree with each other and the version', () => {
    seed()

    const { entries, notes } = run({
      argv: ['--tag', 'v1.1.0'],
      env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.1.0' },
    })
    expect(entries).toEqual([])
    expect(notes.join('\n')).toContain('from --tag and GITHUB_REF_NAME')
  })
})

describe('resolveTagContext', () => {
  it('reports no context when neither source is present', () => {
    expect(resolveTagContext([], {})).toEqual({ state: 'none' })
  })

  it('ignores GITHUB_REF_NAME when GITHUB_REF_TYPE is not tag', () => {
    expect(resolveTagContext([], { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }))
      .toEqual({ state: 'none' })
  })

  it('reads a value that follows the flag', () => {
    expect(resolveTagContext(['--tag', 'v1.1.0'], {}))
      .toEqual({ state: 'value', value: 'v1.1.0', source: '--tag' })
  })

  it('does not read past the end of the argument list', () => {
    expect(resolveTagContext(['--tag'], {}).state).toBe('error')
  })
})
