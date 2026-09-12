import { createRepo, repoRootFromArgv } from './lib/repo.mjs'
import { formatRuleFindings } from './lib/findings.mjs'
import { nodePinRule } from './rules/node-pin.mjs'
import { cspRule } from './rules/csp.mjs'
import { nativeAuthorityRule } from './rules/native-authority.mjs'
import { entitlementsRule } from './rules/entitlements.mjs'
import { releaseIdentityRule } from './rules/release-identity.mjs'
import { governanceRule } from './rules/governance.mjs'
import { docsTruthfulnessRule } from './rules/docs-truthfulness.mjs'

// Exit codes are part of this tool's contract:
//   0 every rule passed
//   1 at least one rule reported a finding
//   2 the checker itself failed — a rule threw, or the root is unreadable
// A rule crash must never look like a contract violation, because the two call
// for completely different responses.
export const EXIT_OK = 0
export const EXIT_FINDINGS = 1
export const EXIT_CHECKER_ERROR = 2

export const rules = [
  nodePinRule,
  cspRule,
  nativeAuthorityRule,
  entitlementsRule,
  releaseIdentityRule,
  governanceRule,
  docsTruthfulnessRule,
]

/**
 * @param {object} options
 * @param {string} options.root        repository root the rules read from
 * @param {Array}  [options.rules]     injected for tests; defaults to the registry
 * @param {(line: string) => void} [options.log]
 * @param {(line: string) => void} [options.logError]
 * @returns {number} one of the exit codes above
 */
export function runChecks({
  root,
  rules: ruleList = rules,
  argv = [],
  env = {},
  log = console.log,
  logError = console.error,
}) {
  const repo = createRepo(root)
  // Informational lines are not findings: a rule that deliberately skips a
  // check has to say so, because a check that silently does nothing is
  // indistinguishable from one that is broken.
  const notes = []
  const ctx = { ...repo, root, argv, env, info: line => notes.push(line) }

  let total = 0
  let crashed = false

  for (const rule of ruleList) {
    let entries
    try {
      entries = rule.check(ctx)
    } catch (err) {
      crashed = true
      logError(`checker error in rule ${rule.id}: ${err.stack ?? err.message}`)
      continue
    }
    if (!Array.isArray(entries)) {
      crashed = true
      logError(`checker error in rule ${rule.id}: check() did not return an array`)
      continue
    }
    if (entries.length === 0) continue
    total += entries.length
    logError(formatRuleFindings(rule.id, rule.title, entries))
  }

  for (const note of notes) log(note)

  if (crashed) return EXIT_CHECKER_ERROR
  if (total > 0) {
    logError(`\nrelease contract: ${total} finding(s) across ${ruleList.length} rule(s)`)
    return EXIT_FINDINGS
  }
  log(`release contract: ${ruleList.length} rule(s) passed`)
  return EXIT_OK
}

function main(argv) {
  let root
  try {
    root = repoRootFromArgv(argv)
  } catch (err) {
    console.error(`checker error: ${err.message}`)
    return EXIT_CHECKER_ERROR
  }
  return runChecks({ root, argv, env: process.env })
}

// Only self-executes as a program, so the test suite can import the module.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
