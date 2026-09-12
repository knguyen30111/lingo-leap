import { finding } from '../lib/findings.mjs'
import { REQUIRED_GATES, GATE_GROUPS } from '../lib/gate-contract.mjs'

// The gate manifest the runner executes has to BE the required gate list, not
// merely agree with whatever other consumers happen to run. Parity between two
// consumers of a manifest that has quietly lost `npm run typecheck` is a pair
// of surfaces agreeing on the wrong thing, which is the failure this rule
// exists to make impossible.

const GATES_MANIFEST = 'scripts/gates.json'

/** True when `subsequence` appears inside `commands` in the same relative order. */
export function isOrderedSubsequence(commands, subsequence) {
  let cursor = 0
  for (const command of commands) {
    if (command === subsequence[cursor]) cursor += 1
  }
  return cursor === subsequence.length
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

  for (const command of commands) {
    if (!required.includes(command)) {
      findings.push(finding({
        message: `${GATES_MANIFEST} group "${group}" runs "${command}", which the gate contract does not require`,
        file: GATES_MANIFEST,
        evidence: command,
      }))
    }
  }

  // Order matters on its own: an audit or a lint that runs after the build has
  // already produced an artifact is not the gate the contract describes.
  if (missing.length === 0 && !isOrderedSubsequence(commands, required)) {
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
