// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo, defaultRepoRoot, repoRootFromArgv } from './repo.mjs'

// Fixtures live under os.tmpdir() through fs.mkdtemp and are removed in
// afterEach, so the suite stays hermetic on a runner that has no scratchpad.
let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-reader-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

describe('createRepo readers', () => {
  it('reads a tracked file as text', () => {
    write('.nvmrc', '24\n')

    expect(createRepo(fixture).readText('.nvmrc')).toBe('24\n')
  })

  // A thrown ENOENT here would surface as a checker crash and mask the rule
  // bug underneath it, so absence has to be a value the caller can branch on.
  it('answers a missing file with null rather than throwing', () => {
    const repo = createRepo(fixture)

    expect(repo.readText('nope.txt')).toBeNull()
    expect(repo.readLines('nope.txt')).toBeNull()
    expect(repo.exists('nope.txt')).toBe(false)
  })

  it('answers a directory read with null rather than throwing', () => {
    fs.mkdirSync(path.join(fixture, 'somedir'))

    expect(createRepo(fixture).readText('somedir')).toBeNull()
  })

  it('splits a file into lines', () => {
    write('a.txt', 'one\ntwo\nthree')

    expect(createRepo(fixture).readLines('a.txt')).toEqual(['one', 'two', 'three'])
  })

  it('reports an existing file', () => {
    write('a.txt', 'x')

    expect(createRepo(fixture).exists('a.txt')).toBe(true)
  })

  it('parses JSON into an ok result', () => {
    write('package.json', '{"name":"x"}')

    expect(createRepo(fixture).readJson('package.json')).toEqual({ ok: true, value: { name: 'x' } })
  })

  // "absent" and "present but unparseable" call for different findings.
  it('distinguishes missing JSON from malformed JSON', () => {
    const repo = createRepo(fixture)
    expect(repo.readJson('package.json')).toEqual({ ok: false, reason: 'missing' })

    write('package.json', '{not json')
    const result = repo.readJson('package.json')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid')
    expect(typeof result.error).toBe('string')
  })

  it('lists only workflow YAML files, sorted, as repo-relative paths', () => {
    write('.github/workflows/ci.yml', 'name: CI')
    write('.github/workflows/package-macos.yml', 'name: package')
    write('.github/workflows/notes.md', 'ignore me')

    expect(createRepo(fixture).listWorkflowFiles()).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/package-macos.yml',
    ])
  })

  it('lists no workflow files when the directory is absent', () => {
    expect(createRepo(fixture).listWorkflowFiles()).toEqual([])
  })
})

describe('repository root resolution', () => {
  it('resolves the repository this checker ships inside', () => {
    expect(fs.existsSync(path.join(defaultRepoRoot(), 'package.json'))).toBe(true)
  })

  it('falls back when no --root is given', () => {
    expect(repoRootFromArgv([], '/fallback')).toBe('/fallback')
  })

  // --root is the injection point every negative check uses, so a rule is
  // proven to fail against a fixture rather than against a damaged worktree.
  it('takes an absolute root from --root', () => {
    expect(repoRootFromArgv(['--root', fixture], '/fallback')).toBe(fs.realpathSync(fixture) === fixture ? fixture : path.resolve(fixture))
  })

  it('rejects --root with no argument', () => {
    expect(() => repoRootFromArgv(['--root'])).toThrow(/requires a directory/)
  })
})
