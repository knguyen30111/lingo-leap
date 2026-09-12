// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { REQUIRED_GATES, GATE_GROUPS } from '../lib/gate-contract.mjs'
import { gateManifestRule, isExactGateList } from './gate-manifest.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-manifest-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

/** The canonical manifest, optionally with one group replaced. */
function manifest(overrides = {}) {
  const value = {}
  for (const group of GATE_GROUPS) value[group] = [...REQUIRED_GATES[group]]
  return { ...value, ...overrides }
}

function write(value) {
  const target = path.join(fixture, 'scripts')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(
    path.join(target, 'gates.json'),
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  )
}

function run() {
  return gateManifestRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

describe('gate-manifest rule', () => {
  it('reports nothing when the manifest is the canonical contract', () => {
    write(manifest())

    expect(run()).toEqual([])
  })

  // The defect: parity between two consumers of a short manifest passes while
  // the manifest itself has lost a gate.
  it('reports a frontend manifest that has dropped the typecheck gate', () => {
    write(manifest({ frontend: REQUIRED_GATES.frontend.filter(c => c !== 'npm run typecheck') }))

    expect(messages()).toContain('scripts/gates.json group "frontend" does not run "npm run typecheck"')
  })

  it.each(REQUIRED_GATES.frontend.map(command => [command]))(
    'reports a frontend manifest that has dropped %s',
    command => {
      write(manifest({ frontend: REQUIRED_GATES.frontend.filter(c => c !== command) }))

      expect(messages()).toContain(`does not run "${command}"`)
    }
  )

  it('reports a rust manifest that has dropped the locked cargo check', () => {
    write(manifest({ rust: [] }))

    expect(messages()).toContain('scripts/gates.json group "rust" is missing or empty')
  })

  it('reports an unlocked cargo check standing in for the locked one', () => {
    write(manifest({ rust: ['cargo check --manifest-path src-tauri/Cargo.toml'] }))

    expect(messages()).toContain('does not run "cargo check --locked --manifest-path src-tauri/Cargo.toml"')
  })

  // Order is part of the contract: audit and lint before a build that could
  // succeed on a compromised tree.
  it('reports a manifest that runs the required gates out of order', () => {
    const reordered = [...REQUIRED_GATES.frontend]
    const build = reordered.indexOf('npm run build')
    const lint = reordered.indexOf('npm run lint')
    ;[reordered[build], reordered[lint]] = [reordered[lint], reordered[build]]
    write(manifest({ frontend: reordered }))

    expect(messages()).toContain('scripts/gates.json group "frontend" runs the required gates out of order')
  })

  it('reports an extra command the contract does not require', () => {
    write(manifest({ frontend: [...REQUIRED_GATES.frontend, 'npm run deploy'] }))

    expect(messages()).toContain('runs "npm run deploy", which the gate contract does not require')
  })

  it('reports a group the contract does not define', () => {
    write(manifest({ e2e: ['npm run e2e'] }))

    expect(messages()).toContain('scripts/gates.json defines gate group "e2e", which the gate contract does not require')
  })

  it('reports an absent manifest', () => {
    expect(messages()).toContain('scripts/gates.json is missing')
  })

  it('reports a manifest that is not valid JSON', () => {
    write('{not json')

    expect(messages()).toContain('scripts/gates.json is not valid JSON')
  })

  // A duplicate is the hole an ordered-subsequence check cannot see: every
  // required command is still present, in order, so the manifest passes while
  // the runner would execute a gate twice.
  it('reports a duplicate command prepended to the required list', () => {
    write(manifest({ frontend: ['npm run build', ...REQUIRED_GATES.frontend] }))

    expect(messages()).toContain('scripts/gates.json group "frontend" runs "npm run build" more than once')
  })

  it('reports a duplicate command appended to the required list', () => {
    write(manifest({ frontend: [...REQUIRED_GATES.frontend, 'npm ci'] }))

    expect(messages()).toContain('scripts/gates.json group "frontend" runs "npm ci" more than once')
  })

  it('reports a duplicate in the rust group', () => {
    const locked = REQUIRED_GATES.rust[0]
    write(manifest({ rust: [locked, locked] }))

    expect(messages()).toContain(`scripts/gates.json group "rust" runs "${locked}" more than once`)
  })

  // The positive statement of the same rule: each group has to equal the
  // required list element for element, so no arrangement that is merely
  // compatible with it passes.
  it('accepts only the exact required list for every group', () => {
    for (const group of GATE_GROUPS) {
      const required = REQUIRED_GATES[group]
      write(manifest())
      expect(isExactGateList(required, required)).toBe(true)
      expect(isExactGateList([...required, required[0]], required)).toBe(false)
      expect(isExactGateList([required[0], ...required], required)).toBe(false)
      expect(isExactGateList([...required].reverse(), required)).toBe(
        required.length === 1
      )
    }
  })

  it('reports a group that is not an array', () => {
    write(manifest({ rust: 'cargo check' }))

    expect(messages()).toContain('scripts/gates.json group "rust" is missing or empty')
  })
})
