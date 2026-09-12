// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { nodePinRule } from './node-pin.mjs'

// Every case runs against a fixture root. No case corrupts a tracked file and
// restores it, so an interrupted run cannot discard real work.
let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'node-pin-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

const GOOD_SCRIPTS = {
  lint: 'eslint src scripts --max-warnings 0',
  'lint:workflows': 'bash scripts/lint-workflows.sh',
  typecheck: 'tsc --noEmit',
  'verify:release-contract': 'node scripts/release-contract/cli.mjs',
  build: 'vite build',
  'test:coverage': 'vitest run --coverage',
}

const GOOD_CHECKSUMS = [
  'ACTIONLINT_VERSION=1.7.12',
  'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f  actionlint_1.7.12_darwin_arm64.tar.gz',
  '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  actionlint_1.7.12_linux_amd64.tar.gz',
  '',
].join('\n')

function seedAgreeingFixture(overrides = {}) {
  write('.nvmrc', `${overrides.nvmrc ?? '24'}\n`)
  write('Dockerfile.linux', overrides.dockerfile ?? [
    '# Install Node.js 24',
    'RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \\',
    '    && apt-get install -y nodejs',
    '',
  ].join('\n'))
  write('package.json', JSON.stringify({ scripts: { ...GOOD_SCRIPTS, ...(overrides.scripts ?? {}) } }, null, 2))
  write('scripts/actionlint.sha256', overrides.checksums ?? GOOD_CHECKSUMS)
  write('.github/workflows/ci.yml', overrides.workflow ?? [
    'jobs:',
    '  frontend:',
    '    steps:',
    '      - uses: actions/setup-node@v7',
    '        with:',
    '          node-version-file: .nvmrc',
    '',
  ].join('\n'))
}

function run() {
  return nodePinRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

describe('node-pin rule', () => {
  it('reports nothing when every surface agrees', () => {
    seedAgreeingFixture()

    expect(run()).toEqual([])
  })

  it('reports the Dockerfile major and the .nvmrc major by value when they disagree', () => {
    seedAgreeingFixture({
      dockerfile: [
        '# Install Node.js 20',
        'RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
        '',
      ].join('\n'),
    })

    const entries = run()
    const text = entries.map(e => e.message).join('\n')
    expect(text).toContain('Dockerfile.linux installs Node 20 but .nvmrc pins 24')
    expect(text).toContain('Dockerfile.linux comment says Node.js 20 but .nvmrc pins 24')
    // The finding carries the line and the offending text, not just a verdict.
    const setupFinding = entries.find(e => e.message.includes('installs Node 20'))
    expect(setupFinding.file).toBe('Dockerfile.linux')
    expect(setupFinding.line).toBe(2)
    expect(setupFinding.evidence).toContain('setup_20.x')
  })

  it('reports a workflow that pins a literal node-version, naming the file and line', () => {
    seedAgreeingFixture({
      workflow: [
        'jobs:',
        '  frontend:',
        '    steps:',
        '      - uses: actions/setup-node@v7',
        '        with:',
        '          node-version: 20',
        '',
      ].join('\n'),
    })

    const entries = run()
    const literal = entries.find(e => e.message.includes('literal Node version'))
    expect(literal).toBeDefined()
    expect(literal.file).toBe('.github/workflows/ci.yml')
    expect(literal.line).toBe(6)
    expect(literal.evidence).toBe('node-version: 20')
  })

  it('reports a workflow that sets up Node with no version file at all', () => {
    seedAgreeingFixture({
      workflow: ['jobs:', '  frontend:', '    steps:', '      - uses: actions/setup-node@v7', ''].join('\n'),
    })

    expect(messages()).toContain('sets up Node without node-version-file: .nvmrc')
  })

  it('reports a missing .nvmrc', () => {
    seedAgreeingFixture()
    fs.rmSync(path.join(fixture, '.nvmrc'))

    expect(messages()).toContain('.nvmrc is missing')
  })

  it('reports an .nvmrc that is not a bare major', () => {
    seedAgreeingFixture({ nvmrc: '24.21.0' })

    expect(messages()).toContain('.nvmrc must contain a single bare major version')
  })

  it('names the missing script when package.json omits one the gate list needs', () => {
    seedAgreeingFixture()
    const manifest = { scripts: { ...GOOD_SCRIPTS } }
    delete manifest.scripts.typecheck
    write('package.json', JSON.stringify(manifest))

    expect(messages()).toContain('package.json declares no "typecheck" script')
  })

  it('names each missing script separately', () => {
    seedAgreeingFixture()
    write('package.json', JSON.stringify({ scripts: { build: 'vite build' } }))

    const text = messages()
    for (const name of ['lint', 'lint:workflows', 'typecheck', 'verify:release-contract', 'test:coverage']) {
      expect(text).toContain(`declares no "${name}" script`)
    }
  })

  // If build still type-checks, a type error is reported as a build failure and
  // the typecheck gate proves nothing on its own.
  it('reports a build script that still invokes tsc', () => {
    seedAgreeingFixture({ scripts: { build: 'tsc && vite build' } })

    expect(messages()).toContain('the build script invokes tsc')
  })

  it('does not mistake a substring for a tsc invocation', () => {
    seedAgreeingFixture({ scripts: { build: 'vite build --mode tscsomething' } })

    expect(messages()).not.toContain('the build script invokes tsc')
  })

  it('reports a typecheck script that does not run tsc --noEmit', () => {
    seedAgreeingFixture({ scripts: { typecheck: 'tsc' } })

    expect(messages()).toContain('the typecheck script must run tsc --noEmit')
  })

  it('reports a missing actionlint checksum file', () => {
    seedAgreeingFixture()
    fs.rmSync(path.join(fixture, 'scripts/actionlint.sha256'))

    expect(messages()).toContain('the pinned actionlint checksum file is missing')
  })

  it('reports a checksum file that pins no version', () => {
    seedAgreeingFixture({
      checksums: GOOD_CHECKSUMS.split('\n').filter(line => !line.startsWith('ACTIONLINT_VERSION')).join('\n'),
    })

    expect(messages()).toContain('pins no ACTIONLINT_VERSION')
  })

  // A file with one platform pinned leaves the other — possibly the CI runner —
  // verifying against nothing.
  it('reports a checksum file that pins only one platform', () => {
    seedAgreeingFixture({
      checksums: GOOD_CHECKSUMS.split('\n').filter(line => !line.includes('linux_amd64')).join('\n'),
    })

    expect(messages()).toContain('pins no 64-hex digest for linux_amd64')
  })

  it('reports a digest that is not 64 hex characters', () => {
    seedAgreeingFixture({
      checksums: [
        'ACTIONLINT_VERSION=1.7.12',
        'deadbeef  actionlint_1.7.12_darwin_arm64.tar.gz',
        '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  actionlint_1.7.12_linux_amd64.tar.gz',
        '',
      ].join('\n'),
    })

    expect(messages()).toContain('pins no 64-hex digest for darwin_arm64')
  })

  it('reports malformed package.json distinctly from a missing one', () => {
    seedAgreeingFixture()
    write('package.json', '{not json')

    expect(messages()).toContain('package.json is not valid JSON')
  })
})
