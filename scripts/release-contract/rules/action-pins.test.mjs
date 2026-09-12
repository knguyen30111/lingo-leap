// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import {
  actionPinsRule,
  runCommands,
  usesEntries,
  parseUsesValue,
  unparsedUsesLines,
} from './action-pins.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'action-pins-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
}

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1'

const GATES = {
  frontend: ['npm ci', 'npm run lint', 'npm run build'],
  rust: ['cargo check --locked --manifest-path src-tauri/Cargo.toml'],
}

const CI = [
  'name: CI',
  'on:',
  '  pull_request:',
  'jobs:',
  '  frontend:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  `      - uses: actions/checkout@${SHA} # v7`,
  '      - name: Gates',
  '        run: node scripts/run-gates.mjs frontend',
  '  rust:',
  '    runs-on: macos-latest',
  '    steps:',
  `      - uses: actions/checkout@${SHA} # v7`,
  '      - name: Gates',
  '        run: node scripts/run-gates.mjs rust',
  '',
].join('\n')

const PACKAGE = [
  'name: package-macos',
  'on:',
  '  workflow_dispatch:',
  'jobs:',
  '  bundle:',
  '    runs-on: macos-latest',
  '    steps:',
  `      - uses: actions/checkout@${SHA} # v7`,
  '      - name: Frontend gates',
  '        run: node scripts/run-gates.mjs frontend',
  '      - name: Rust gates',
  '        run: node scripts/run-gates.mjs rust',
  '      - name: Build',
  '        run: npm run tauri:build',
  '      - name: Verify',
  '        run: npm run verify:package -- src-tauri/target/release/bundle',
  '',
].join('\n')

const DEPENDABOT = [
  'version: 2',
  'updates:',
  '  - package-ecosystem: github-actions',
  '    directory: "/"',
  '    target-branch: main',
  '    schedule:',
  '      interval: weekly',
  '  - package-ecosystem: npm',
  '    directory: "/"',
  '    target-branch: main',
  '    schedule:',
  '      interval: weekly',
  '  - package-ecosystem: cargo',
  '    directory: "/src-tauri"',
  '    target-branch: main',
  '    schedule:',
  '      interval: weekly',
  '',
].join('\n')

const PINS = [
  'ACTIONLINT_VERSION=1.7.12',
  'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f  actionlint_1.7.12_darwin_arm64.tar.gz',
  '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  actionlint_1.7.12_linux_amd64.tar.gz',
  '',
].join('\n')

function seed(overrides = {}) {
  write('.github/workflows/ci.yml', overrides.ci ?? CI)
  write('.github/workflows/package-macos.yml', overrides.pkg ?? PACKAGE)
  write('.github/dependabot.yml', overrides.dependabot ?? DEPENDABOT)
  write('scripts/gates.json', overrides.gates ?? GATES)
  write('scripts/lint-workflows.sh', overrides.lintScript ?? '#!/usr/bin/env bash\ncat scripts/actionlint.sha256\n')
  write('scripts/actionlint.sha256', overrides.pins ?? PINS)
  write('package.json', { scripts: overrides.scripts ?? { 'verify:package': 'node scripts/verify-package.mjs' } })
}

function run() {
  return actionPinsRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(e => e.message).join('\n')
}

describe('action-pins: pinning', () => {
  it('reports nothing for a fully pinned, parity-correct pair of workflows', () => {
    seed()

    expect(run()).toEqual([])
  })

  it.each(['actions/checkout@v7', 'actions/checkout@main', 'actions/checkout@master', 'actions/checkout@3d3c42e'])(
    'reports the mutable reference %s',
    ref => {
      seed({ ci: CI.replace(`actions/checkout@${SHA}`, ref) })

      expect(messages()).toContain('uses a mutable action reference instead of an immutable commit')
    }
  )

  it('reports a pin with no version comment', () => {
    seed({ ci: CI.replace(`actions/checkout@${SHA} # v7`, `actions/checkout@${SHA}`) })

    expect(messages()).toContain('pins an action with no version comment')
  })

  it('accepts a pinned action with a subpath', () => {
    seed({ ci: CI.replace(`actions/checkout@${SHA}`, `actions/cache/restore@${SHA}`) })

    expect(run()).toEqual([])
  })

  // Text-parsing edge cases the rule could get wrong.
  it('ignores a uses: inside a comment', () => {
    seed({ ci: CI.replace('      - name: Gates', '      # - uses: actions/checkout@v7\n      - name: Gates') })

    expect(run()).toEqual([])
  })

  it('ignores a quoted uses: value', () => {
    seed({ ci: CI.replace('      - name: Gates', '      - name: echo\n        env:\n          X: "uses: actions/checkout@v7"\n      - name: Gates') })

    expect(messages()).not.toContain('mutable action reference')
  })
})

describe('action-pins: packaging trigger', () => {
  it('reports a push trigger', () => {
    seed({ pkg: PACKAGE.replace('  workflow_dispatch:', '  workflow_dispatch:\n  push:\n    branches: [main]') })

    expect(messages()).toContain('declares a push trigger')
  })

  it('reports a tags trigger', () => {
    seed({ pkg: PACKAGE.replace('  workflow_dispatch:', "  workflow_dispatch:\n  push:\n    tags:\n      - 'v*'") })

    expect(messages()).toContain('declares a tags trigger')
  })
})

describe('action-pins: dependabot', () => {
  it('reports a missing dependabot config', () => {
    seed()
    fs.rmSync(path.join(fixture, '.github/dependabot.yml'))

    expect(messages()).toContain('.github/dependabot.yml is missing')
  })

  it.each(['github-actions', 'npm', 'cargo'])('reports a missing %s ecosystem', ecosystem => {
    const stripped = DEPENDABOT.split('\n')
      .filter(l => !l.includes(`package-ecosystem: ${ecosystem}`))
      .join('\n')
    seed({ dependabot: stripped })

    expect(messages()).toContain(`does not watch the ${ecosystem} ecosystem`)
  })

  it('reports an unexpected ecosystem', () => {
    seed({ dependabot: `${DEPENDABOT}  - package-ecosystem: docker\n    target-branch: main\n` })

    expect(messages()).toContain('watches an unexpected ecosystem: docker')
  })

  it('reports a target-branch that is not main', () => {
    seed({ dependabot: DEPENDABOT.replace('target-branch: main\n    schedule:\n      interval: weekly\n  - package-ecosystem: npm', 'target-branch: epic/refactor-tech-debt\n    schedule:\n      interval: weekly\n  - package-ecosystem: npm') })

    expect(messages()).toContain('must set target-branch: main on every ecosystem')
  })

  it('reports a missing target-branch', () => {
    seed({ dependabot: DEPENDABOT.replace('    target-branch: main\n', '') })

    expect(messages()).toContain('must set target-branch: main on every ecosystem')
  })
})

describe('action-pins: gate parity through the shared runner', () => {
  it('reports package-macos.yml missing the frontend invocation', () => {
    seed({ pkg: PACKAGE.replace('      - name: Frontend gates\n        run: node scripts/run-gates.mjs frontend\n', '') })

    expect(messages()).toContain('does not run "node scripts/run-gates.mjs frontend"')
  })

  // The Rust half, which a fixture set checking only the frontend group passes.
  it('reports package-macos.yml missing the rust invocation', () => {
    seed({ pkg: PACKAGE.replace('      - name: Rust gates\n        run: node scripts/run-gates.mjs rust\n', '') })

    expect(messages()).toContain('would package without the Rust gate CI enforces')
  })

  it('reports the rust job of ci.yml missing its invocation', () => {
    seed({ ci: CI.replace('      - name: Gates\n        run: node scripts/run-gates.mjs rust\n', '') })

    expect(messages()).toContain('the rust job of .github/workflows/ci.yml does not run')
  })

  it('reports the frontend job of ci.yml missing its invocation', () => {
    seed({ ci: CI.replace('      - name: Gates\n        run: node scripts/run-gates.mjs frontend\n', '') })

    expect(messages()).toContain('the frontend job of .github/workflows/ci.yml does not run')
  })

  it('reports the two invocations in the wrong order', () => {
    const swapped = PACKAGE
      .replace('      - name: Frontend gates\n        run: node scripts/run-gates.mjs frontend\n', '')
      .replace('      - name: Rust gates\n        run: node scripts/run-gates.mjs rust\n',
               '      - name: Rust gates\n        run: node scripts/run-gates.mjs rust\n      - name: Frontend gates\n        run: node scripts/run-gates.mjs frontend\n')
    seed({ pkg: swapped })

    expect(messages()).toContain('runs the rust gate group before the frontend group')
  })

  it('reports gates that run after the bundle build', () => {
    const after = PACKAGE
      .replace('      - name: Frontend gates\n        run: node scripts/run-gates.mjs frontend\n      - name: Rust gates\n        run: node scripts/run-gates.mjs rust\n', '')
      .replace('      - name: Verify\n',
               '      - name: Frontend gates\n        run: node scripts/run-gates.mjs frontend\n      - name: Rust gates\n        run: node scripts/run-gates.mjs rust\n      - name: Verify\n')
    seed({ pkg: after })

    const text = messages()
    expect(text).toContain('runs the frontend gate group after the bundle build')
    expect(text).toContain('runs the rust gate group after the bundle build')
  })

  // A second copy can drift, so it is a finding even when it matches today.
  it('reports a manifest command hand-spelled as its own run step', () => {
    seed({ ci: CI.replace('      - name: Gates\n        run: node scripts/run-gates.mjs frontend',
                          '      - name: Lint\n        run: npm run lint\n      - name: Gates\n        run: node scripts/run-gates.mjs frontend') })

    expect(messages()).toContain('spells out a gate command that belongs to scripts/gates.json')
  })

  it('reports a manifest command hidden inside a multi-line run block', () => {
    seed({ ci: CI.replace('      - name: Gates\n        run: node scripts/run-gates.mjs frontend',
                          '      - name: Setup\n        run: |\n          echo starting\n          npm run lint\n      - name: Gates\n        run: node scripts/run-gates.mjs frontend') })

    expect(messages()).toContain('spells out a gate command that belongs to scripts/gates.json')
  })

  it('reports an invocation naming a group the manifest does not define', () => {
    seed({ pkg: PACKAGE.replace('        run: npm run tauri:build',
                                '        run: node scripts/run-gates.mjs e2e\n      - name: Build\n        run: npm run tauri:build') })

    expect(messages()).toContain('invokes gate group "e2e", which scripts/gates.json does not define')
  })

  it('reports a manifest group no workflow invokes', () => {
    seed({ gates: { ...GATES, e2e: ['npm run test:e2e'] } })

    expect(messages()).toContain('defines gate group "e2e", which no workflow invokes')
  })

  it('reports a missing gates manifest', () => {
    seed()
    fs.rmSync(path.join(fixture, 'scripts/gates.json'))

    expect(messages()).toContain('scripts/gates.json is missing')
  })

  // --- the boundary pair -------------------------------------------------
  // Together these prove a non-gate command neither satisfies parity nor
  // violates it, which is what makes this assertion implementable at all.

  it('does not report the real non-gate run steps as parity findings', () => {
    const withNonGates = PACKAGE.replace(
      '      - name: Frontend gates',
      [
        '      - name: Status',
        '        run: echo "ad-hoc signed, not notarized, not for distribution"',
        '      - name: Assert arm64',
        '        run: [ "$(uname -m)" = "arm64" ]',
        '      - name: Record toolchain',
        '        run: |',
        '          node -v',
        '          npm -v',
        '          rustc --version',
        '          cargo --version',
        '          sw_vers',
        '      - name: Archive',
        '        run: |',
        '          cd src-tauri/target/release/bundle/macos',
        '          tar -czf app.tar.gz ./*.app',
        '      - name: Frontend gates',
      ].join('\n')
    )
    seed({ pkg: withNonGates })

    expect(run()).toEqual([])
  })

  it('does not let a command that merely mentions a gate satisfy the check', () => {
    const nearMiss = PACKAGE
      .replace('        run: node scripts/run-gates.mjs frontend', '        run: echo "gates run via scripts/run-gates.mjs"')
      .replace('        run: node scripts/run-gates.mjs rust', '        run: echo npm run lint')
    seed({ pkg: nearMiss })

    const text = messages()
    expect(text).toContain('does not run "node scripts/run-gates.mjs frontend"')
    expect(text).toContain('would package without the Rust gate CI enforces')
    // …and the echo is not treated as a hand-spelled copy either.
    expect(text).not.toContain('spells out a gate command')
  })
})

describe('action-pins: verifier invocation', () => {
  // The case the assertion exists for: "the string appears somewhere" passes it.
  it('reports a bare verify:package with no bundle-root argument', () => {
    seed({ pkg: PACKAGE.replace('        run: npm run verify:package -- src-tauri/target/release/bundle', '        run: npm run verify:package') })

    expect(messages()).toContain('runs the package verifier without a bundle-root argument')
  })

  it('reports a verify:package with a bare -- and nothing after it', () => {
    seed({ pkg: PACKAGE.replace('-- src-tauri/target/release/bundle', '--') })

    expect(messages()).toContain('without a bundle-root argument')
  })

  it('reports a missing verifier step', () => {
    seed({ pkg: PACKAGE.replace('      - name: Verify\n        run: npm run verify:package -- src-tauri/target/release/bundle\n', '') })

    expect(messages()).toContain('does not run the package verifier')
  })

  it('reports a package.json with no verify:package script', () => {
    seed({ scripts: { build: 'vite build' } })

    expect(messages()).toContain('package.json declares no "verify:package" script')
  })
})

describe('action-pins: actionlint pin', () => {
  it('reports a missing checksum file', () => {
    seed()
    fs.rmSync(path.join(fixture, 'scripts/actionlint.sha256'))

    expect(messages()).toContain('scripts/actionlint.sha256 is missing')
  })

  it('reports a missing lint-workflows script', () => {
    seed()
    fs.rmSync(path.join(fixture, 'scripts/lint-workflows.sh'))

    expect(messages()).toContain('scripts/lint-workflows.sh is missing')
  })

  it('reports a lint script that does not reference the checksum file', () => {
    seed({ lintScript: '#!/usr/bin/env bash\ncurl -fsSL example.com/actionlint | sh\n' })

    expect(messages()).toContain('does not reference the committed checksum file')
  })

  it.each(['darwin_arm64', 'linux_amd64'])('reports a checksum file missing the %s digest', platform => {
    seed({ pins: PINS.split('\n').filter(l => !l.includes(platform)).join('\n') })

    expect(messages()).toContain(`pins no digest for ${platform}`)
  })

  it('reports a checksum file pinning a different version', () => {
    seed({ pins: PINS.replace('1.7.12', '1.7.11') })

    expect(messages()).toContain('does not pin actionlint 1.7.12')
  })
})

describe('text readers', () => {
  it('reads inline run commands with their line numbers', () => {
    const text = 'jobs:\n  a:\n    steps:\n      - run: npm ci\n'

    expect(runCommands(text)).toEqual([{ line: 4, command: 'npm ci' }])
  })

  it('reads each line of a block scalar separately', () => {
    const text = 'steps:\n  - run: |\n      node -v\n      npm -v\n  - run: echo done\n'

    expect(runCommands(text).map(c => c.command)).toEqual(['node -v', 'npm -v', 'echo done'])
  })

  it('separates a uses: value from its comment', () => {
    expect(usesEntries(`      - uses: actions/checkout@${SHA} # v7`)).toEqual([
      { line: 1, value: `actions/checkout@${SHA}`, comment: 'v7' },
    ])
  })

  it('reports a null comment when there is none', () => {
    expect(usesEntries('      - uses: actions/checkout@v7')[0].comment).toBeNull()
  })

  it('reads a single-quoted value and its trailing comment', () => {
    expect(usesEntries(`      - uses: 'actions/checkout@${SHA}' # v7`)).toEqual([
      { line: 1, value: `actions/checkout@${SHA}`, comment: 'v7' },
    ])
  })

  it('reads a double-quoted value and its trailing comment', () => {
    expect(usesEntries(`      - uses: "actions/checkout@${SHA}" # v7`)).toEqual([
      { line: 1, value: `actions/checkout@${SHA}`, comment: 'v7' },
    ])
  })

  it('reads a quoted value with no comment', () => {
    expect(usesEntries(`      - uses: 'actions/checkout@${SHA}'`)[0].comment).toBeNull()
  })

  it('unescapes a doubled single quote inside a single-quoted value', () => {
    expect(parseUsesValue("'a''b'").value).toBe("a'b")
  })

  it('unescapes a backslash-escaped quote inside a double-quoted value', () => {
    expect(parseUsesValue('"a\\"b"').value).toBe('a"b')
  })

  // Conservative cases: an expression can resolve to anything, and a value
  // this reader cannot parse must not be judged by shape.
  it.each([
    ['a bare expression', '${{ matrix.action }}'],
    ['an expression inside a quoted value', "'owner/repo@${{ env.SHA }}'"],
    ['an unterminated single quote', "'owner/repo@v1"],
    ['an unterminated double quote', '"owner/repo@v1'],
    ['trailing text that is not a comment', "'owner/repo@v1' with: x"],
  ])('leaves %s unparsed rather than guessing', (_label, rest) => {
    expect(parseUsesValue(rest)).toBeNull()
  })

  it('lists the lines it left unparsed so a silent skip is visible', () => {
    const text = [
      '      - uses: ${{ matrix.action }}',
      `      - uses: actions/checkout@${SHA} # v7`,
      "      - uses: 'owner/repo@v1",
    ].join('\n')

    expect(unparsedUsesLines(text)).toEqual([
      { line: 1, value: '${{ matrix.action }}' },
      { line: 3, value: "'owner/repo@v1" },
    ])
  })

  it('skips a commented-out uses line', () => {
    expect(usesEntries('      # - uses: actions/checkout@v7')).toEqual([])
  })
})

describe('action-pins: quoted action references', () => {
  const withStep = step => [
    'name: CI',
    'on:',
    '  pull_request:',
    'jobs:',
    '  frontend:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    `      ${step}`,
    '      - name: Gates',
    '        run: node scripts/run-gates.mjs frontend',
    '  rust:',
    '    runs-on: macos-latest',
    '    steps:',
    `      - uses: actions/checkout@${SHA} # v7`,
    '      - name: Gates',
    '        run: node scripts/run-gates.mjs rust',
    '',
  ].join('\n')

  it('accepts a single-quoted immutable pin with a version comment', () => {
    seed({ ci: withStep(`- uses: 'actions/checkout@${SHA}' # v7`) })

    expect(run()).toEqual([])
  })

  it('accepts a double-quoted immutable pin with a version comment', () => {
    seed({ ci: withStep(`- uses: "actions/checkout@${SHA}" # v7`) })

    expect(run()).toEqual([])
  })

  // The hole this closes: quoting an action reference used to exempt it.
  it('rejects a single-quoted mutable tag reference', () => {
    seed({ ci: withStep("- uses: 'actions/checkout@v7' # v7") })

    expect(messages()).toContain('uses a mutable action reference instead of an immutable commit')
  })

  it('rejects a double-quoted mutable branch reference', () => {
    seed({ ci: withStep('- uses: "actions/checkout@main"') })

    expect(messages()).toContain('uses a mutable action reference instead of an immutable commit')
  })

  it('rejects a quoted immutable pin that carries no version comment', () => {
    seed({ ci: withStep(`- uses: 'actions/checkout@${SHA}'`) })

    expect(messages()).toContain('pins an action with no version comment')
  })

  it('leaves an expression reference to actionlint rather than judging it', () => {
    seed({ ci: withStep('- uses: ${{ matrix.action }}') })

    expect(messages()).not.toContain('mutable action reference')
  })

  it('notes the references it declined to judge', () => {
    const notes = []
    const ctx = { ...createRepo(fixture), root: fixture, info: line => notes.push(line) }
    seed({ ci: withStep('- uses: ${{ matrix.action }}') })
    actionPinsRule.check(ctx)

    expect(notes.join('\n')).toContain('.github/workflows/ci.yml:8')
  })
})

describe('action-pins: verification artifact naming', () => {
  const withArtifact = name => PACKAGE.replace(
    '      - name: Verify\n        run: npm run verify:package -- src-tauri/target/release/bundle\n',
    '      - name: Verify\n        run: npm run verify:package -- src-tauri/target/release/bundle\n' +
    `      - uses: actions/upload-artifact@${SHA} # v7\n` +
    `        with:\n          name: ${name}\n`
  )

  it('accepts a name that says both ad-hoc signed and identity unsigned', () => {
    seed({ pkg: withArtifact('lingo-leap-verification-adhoc-signed-identity-unsigned-dmg-abc') })

    expect(run()).toEqual([])
  })

  // "unsigned" alone is wrong in both directions: the bundle IS signed, and
  // what it lacks is an identity.
  it('rejects a name that calls the artifact merely unsigned', () => {
    seed({ pkg: withArtifact('lingo-leap-verification-unsigned-dmg-abc') })

    expect(messages()).toContain(
      'names an artifact "unsigned", but the bundle is ad-hoc signed with no Developer ID identity'
    )
  })

  it('rejects a name that says ad-hoc signed without saying the identity is absent', () => {
    seed({ pkg: withArtifact('lingo-leap-verification-adhoc-signed-dmg-abc') })

    expect(messages()).toContain('does not say the signing identity is absent')
  })

  // The shape a real name has: a run-scoped suffix built from expressions
  // whose inner spaces must not end the reader's capture.
  it('rejects a merely-unsigned name carrying a run-scoped expression suffix', () => {
    seed({
      pkg: withArtifact(
        'lingo-leap-verification-unsigned-dmg-${{ github.sha }}-${{ github.run_id }}'
      ),
    })

    expect(messages()).toContain(
      'names an artifact "unsigned", but the bundle is ad-hoc signed with no Developer ID identity'
    )
  })

  it('accepts a precise name carrying a run-scoped expression suffix', () => {
    seed({
      pkg: withArtifact(
        'lingo-leap-verification-adhoc-signed-identity-unsigned-dmg-${{ github.sha }}-${{ github.run_id }}'
      ),
    })

    expect(run()).toEqual([])
  })

  it('ignores step names, which are prose rather than artifact names', () => {
    seed()

    expect(run()).toEqual([])
  })
})
