// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGroup, runGroup } from './run-gates.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST = fs.readFileSync(path.join(HERE, 'gates.json'), 'utf8')

/** A spawn double that records calls and answers from a scripted result list. */
function recordingSpawn(results = []) {
  const calls = []
  const spawn = command => {
    calls.push(command)
    return results[calls.length - 1] ?? { status: 0 }
  }
  spawn.calls = calls
  return spawn
}

describe('readGroup', () => {
  it('returns the frontend gates in manifest order', () => {
    expect(readGroup(MANIFEST, 'frontend')).toEqual([
      'npm ci',
      'npm audit --audit-level=moderate',
      'npm run lint',
      'npm run lint:workflows',
      'npm run typecheck',
      'npm run verify:release-contract',
      'npm run build',
      'npm run test:coverage',
    ])
  })

  it('returns the one rust gate', () => {
    expect(readGroup(MANIFEST, 'rust')).toEqual([
      'cargo check --locked --manifest-path src-tauri/Cargo.toml',
    ])
  })

  it('throws and names the group when it is absent', () => {
    expect(() => readGroup(MANIFEST, 'e2e')).toThrow(/gate group "e2e" is missing or empty/)
  })

  // An empty group must never read as "nothing to run, all clear".
  it('throws on a present but empty group', () => {
    expect(() => readGroup('{"frontend":[]}', 'frontend')).toThrow(/missing or empty/)
  })

  it('throws when the group is not an array', () => {
    expect(() => readGroup('{"frontend":"npm ci"}', 'frontend')).toThrow(/missing or empty/)
  })

  it.each([
    ['an empty string', '{"g":[""]}'],
    ['a whitespace-only string', '{"g":["   "]}'],
    ['a non-string', '{"g":[42]}'],
    ['a multi-line command', '{"g":["npm ci\\nrm -rf /"]}'],
  ])('throws on %s and shows the offending entry', (_label, manifest) => {
    expect(() => readGroup(manifest, 'g')).toThrow(/gate command must be a non-empty single line/)
  })

  it('throws on malformed JSON', () => {
    expect(() => readGroup('{not json', 'frontend')).toThrow()
  })
})

describe('runGroup', () => {
  it('returns 0 and spawns every command once, in order', () => {
    const spawn = recordingSpawn()

    expect(runGroup(['a', 'b', 'c'], spawn)).toBe(0)
    expect(spawn.calls).toEqual(['a', 'b', 'c'])
  })

  // A failing gate must stop the group, not merely be noted.
  it('returns the failing exit status and never spawns the rest', () => {
    const spawn = recordingSpawn([{ status: 0 }, { status: 3 }, { status: 0 }])

    expect(runGroup(['a', 'b', 'c'], spawn)).toBe(3)
    expect(spawn.calls).toEqual(['a', 'b'])
  })

  it('treats a signal-killed child as a failure rather than a pass', () => {
    const spawn = recordingSpawn([{ signal: 'SIGKILL', status: null }])

    expect(runGroup(['a'], spawn)).toBe(1)
  })

  // status 0 with a signal would otherwise slip through as success.
  it('prefers the signal over a zero status', () => {
    const spawn = recordingSpawn([{ signal: 'SIGTERM', status: 0 }])

    expect(runGroup(['a'], spawn)).toBe(1)
  })

  it('never returns 0 for a null status', () => {
    const spawn = recordingSpawn([{ status: null }])

    expect(runGroup(['a'], spawn)).toBe(1)
  })

  it('returns 0 for an empty command list', () => {
    expect(runGroup([], recordingSpawn())).toBe(0)
  })
})
