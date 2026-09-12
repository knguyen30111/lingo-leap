import { finding } from '../lib/findings.mjs'
import { REQUIRED_GATES, GATE_GROUPS } from '../lib/gate-contract.mjs'

// The gate manifest the runner executes has to BE the required gate list, not
// merely agree with whatever other consumers happen to run. Parity between two
// consumers of a manifest that has quietly lost `npm run typecheck` is a pair
// of surfaces agreeing on the wrong thing, which is the failure this rule
// exists to make impossible.
//
// The comparison is therefore element-for-element equality against
// `REQUIRED_GATES`. A missing command, an undeclared command, a repeated
// command, and a permutation are reported separately so the finding names the
// actual defect, but no arrangement other than the exact list passes.

const GATES_MANIFEST = 'scripts/gates.json'

/**
 * True when `commands` is the required list element for element.
 *
 * Equality, not containment or ordered inclusion: a list that merely contains
 * the required commands in the right relative order can still run a gate twice
 * or carry a command the contract never named, and both of those are manifests
 * the runner would execute differently from the contract.
 */
export function isExactGateList(commands, required) {
  return commands.length === required.length
    && commands.every((command, index) => command === required[index])
}

/** Every command appearing more than once, each reported once, in first-seen order. */
export function duplicateCommands(commands) {
  return [...new Set(commands.filter((command, index) => commands.indexOf(command) !== index))]
}

function checkGroup(group, commands, findings) {
  if (!Array.isArray(commands) || commands.length === 0) {
    findings.push(finding({
      message: `${GATES_MANIFEST} group "${group}" is missing or empty`,
      file: GATES_MANIFEST,
      evidence: group,
    }))
    return
  }

  const required = REQUIRED_GATES[group]
  const missing = required.filter(command => !commands.includes(command))
  for (const command of missing) {
    findings.push(finding({
      message: `${GATES_MANIFEST} group "${group}" does not run "${command}"`,
      file: GATES_MANIFEST,
      evidence: command,
    }))
  }

  const undeclared = []
  for (const command of commands) {
    if (!required.includes(command) && !undeclared.includes(command)) {
      undeclared.push(command)
      findings.push(finding({
        message: `${GATES_MANIFEST} group "${group}" runs "${command}", which the gate contract does not require`,
        file: GATES_MANIFEST,
        evidence: command,
      }))
    }
  }

  // A repeated command is its own defect. Every required gate is still present
  // and still in the right relative order, so nothing above sees it, yet the
  // runner executes a gate the contract names once twice.
  const duplicates = duplicateCommands(commands)
  for (const command of duplicates) {
    findings.push(finding({
      message: `${GATES_MANIFEST} group "${group}" runs "${command}" more than once`,
      file: GATES_MANIFEST,
      evidence: command,
    }))
  }

  // What is left once nothing is missing, extra, or repeated is a permutation:
  // an audit or a lint that runs after the build has already produced an
  // artifact is not the gate the contract describes.
  const accounted = missing.length > 0 || undeclared.length > 0 || duplicates.length > 0
  if (!accounted && !isExactGateList(commands, required)) {
    findings.push(finding({
      message: `${GATES_MANIFEST} group "${group}" runs the required gates out of order`,
      file: GATES_MANIFEST,
      evidence: `expected ${required.join(' -> ')}`,
    }))
  }
}

export const gateManifestRule = {
  id: 'gate-manifest',
  title: 'The gate manifest is the complete, ordered gate contract rather than merely agreeing with another consumer',
  check(ctx) {
    const findings = []

    const read = ctx.readJson(GATES_MANIFEST)
    if (!read.ok) {
      findings.push(finding({
        message: read.reason === 'missing'
          ? `${GATES_MANIFEST} is missing, so there is no gate manifest to check`
          : `${GATES_MANIFEST} is not valid JSON`,
        file: GATES_MANIFEST,
        evidence: read.error ?? null,
      }))
      return findings
    }

    const manifest = read.value
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      findings.push(finding({
        message: `${GATES_MANIFEST} must be an object of gate groups`,
        file: GATES_MANIFEST,
      }))
      return findings
    }

    for (const group of GATE_GROUPS) checkGroup(group, manifest[group], findings)

    for (const group of Object.keys(manifest)) {
      if (!GATE_GROUPS.includes(group)) {
        findings.push(finding({
          message: `${GATES_MANIFEST} defines gate group "${group}", which the gate contract does not require`,
          file: GATES_MANIFEST,
          evidence: group,
        }))
      }
    }

    return findings
  },
}
