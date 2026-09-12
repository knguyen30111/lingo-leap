// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { runChecks, rules, EXIT_OK, EXIT_FINDINGS, EXIT_CHECKER_ERROR } from './cli.mjs'
import { finding } from './lib/findings.mjs'
import { defaultRepoRoot } from './lib/repo.mjs'

// The rule list and the repository root are both injected, so the exit-code
// contract is testable without a fixture repository on disk.
function collect() {
  const out = []
  const err = []
  return { out, err, log: line => out.push(line), logError: line => err.push(line) }
}

const passing = { id: 'always-passes', title: 'a rule with nothing to report', check: () => [] }

const failing = {
  id: 'always-fails',
  title: 'a rule that reports one thing',
  check: () => [finding({
    message: 'the pinned value disagrees with the source of truth',
    file: 'Dockerfile.linux',
    line: 27,
    evidence: 'setup_20.x',
  })],
}

const throwing = {
  id: 'always-throws',
  title: 'a rule with a bug in it',
  check: () => { throw new Error('rule blew up') },
}

const notAnArray = { id: 'wrong-shape', title: 'a rule returning the wrong type', check: () => 'nope' }

describe('runChecks exit codes', () => {
  it('exits 0 and prints one success line when every rule passes', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [passing], ...sink })

    expect(code).toBe(EXIT_OK)
    expect(sink.out).toEqual(['release contract: 1 rule(s) passed'])
    expect(sink.err).toEqual([])
  })

  it('exits 1 and prints the rule id, title, message, location, and evidence', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [failing], ...sink })

    expect(code).toBe(EXIT_FINDINGS)
    const text = sink.err.join('\n')
    expect(text).toContain('always-fails')
    expect(text).toContain('a rule that reports one thing')
    expect(text).toContain('the pinned value disagrees with the source of truth')
    expect(text).toContain('Dockerfile.linux:27')
    expect(text).toContain('setup_20.x')
    expect(text).toContain('1 finding(s)')
    expect(sink.out).toEqual([])
  })

  // A crashing rule and a violated contract call for completely different
  // responses, so they must not share an exit code.
  it('exits with a code distinct from a finding when a rule throws', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [throwing], ...sink })

    expect(code).toBe(EXIT_CHECKER_ERROR)
    expect(code).not.toBe(EXIT_FINDINGS)
    expect(sink.err.join('\n')).toContain('checker error in rule always-throws')
  })

  it('treats a rule that does not return an array as a checker error', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [notAnArray], ...sink })

    expect(code).toBe(EXIT_CHECKER_ERROR)
    expect(sink.err.join('\n')).toContain('did not return an array')
  })

  it('reports a crash even when another rule also has findings', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [failing, throwing], ...sink })

    expect(code).toBe(EXIT_CHECKER_ERROR)
  })

  it('counts findings across every rule', () => {
    const sink = collect()

    const code = runChecks({ root: defaultRepoRoot(), rules: [failing, failing, passing], ...sink })

    expect(code).toBe(EXIT_FINDINGS)
    expect(sink.err.join('\n')).toContain('2 finding(s) across 3 rule(s)')
  })
})

describe('rule registry', () => {
  it('registers rules with a unique id, a title, and a check function', () => {
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(typeof rule.id).toBe('string')
      expect(rule.id.length).toBeGreaterThan(0)
      expect(typeof rule.title).toBe('string')
      expect(typeof rule.check).toBe('function')
    }
    expect(new Set(rules.map(r => r.id)).size).toBe(rules.length)
  })
})
