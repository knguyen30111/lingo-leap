// The single canonical statement of which gates this repository requires, in
// which order, for each gate group.
//
// Everything else derives from here: `scripts/gates.json` is the manifest the
// runner executes and is asserted against this list; the documentation rules
// read the required script names from here rather than carrying a second
// hand-written copy that can silently disagree.
//
// Adding or removing a required gate is therefore a deliberate edit to this
// file, and a manifest, a package script, or a document that has not followed
// is a failing gate rather than a review comment.

export const REQUIRED_GATES = Object.freeze({
  frontend: Object.freeze([
    'npm ci',
    'npm audit --audit-level=moderate',
    'npm run lint',
    'npm run lint:workflows',
    'npm run typecheck',
    'npm run verify:release-contract',
    'npm run build',
    'npm run test:coverage',
  ]),
  rust: Object.freeze([
    'cargo check --locked --manifest-path src-tauri/Cargo.toml',
  ]),
})

/** The gate groups, in the order a packaging run has to execute them. */
export const GATE_GROUPS = Object.freeze(Object.keys(REQUIRED_GATES))

/** The runner invocation that is the only authority for running a group. */
export const GATE_RUNNER = 'scripts/run-gates.mjs'

export function gateRunnerCommand(group) {
  return `node ${GATE_RUNNER} ${group}`
}

/** Every required gate command, across all groups, in group order. */
export function requiredGateCommands() {
  return GATE_GROUPS.flatMap(group => [...REQUIRED_GATES[group]])
}

/**
 * The `npm run <name>` gates, as bare script names. This is what package.json
 * has to define and what the documents have to name, derived rather than
 * repeated.
 */
export function requiredNpmScripts() {
  return requiredGateCommands()
    .map(command => command.match(/^npm run ([A-Za-z0-9:_-]+)$/)?.[1])
    .filter(name => typeof name === 'string')
}

/** The `npm run <gate>` commands a contributor has to be able to find by name. */
export function documentedNpmGateCommands() {
  return requiredNpmScripts().map(name => `npm run ${name}`)
}
