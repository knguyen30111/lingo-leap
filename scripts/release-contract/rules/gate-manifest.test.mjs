// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { REQUIRED_GATES, GATE_GROUPS } from '../lib/gate-contract.mjs'
import { gateManifestRule } from './gate-manifest.mjs'

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

  it('reports a group that is not an array', () => {
    write(manifest({ rust: 'cargo check' }))

    expect(messages()).toContain('scripts/gates.json group "rust" is missing or empty')
  })
})
