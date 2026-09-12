import { finding } from '../lib/findings.mjs'

// Workflow supply-chain and gate-parity assertions.
//
// LIMITATION, stated deliberately: this rule reads workflow files as TEXT with
// targeted patterns, because no YAML parser is available without adding a
// dependency. It therefore cannot see everything a parser would — a `uses:`
// inside a quoted string, for instance, is indistinguishable from a real one by
// shape alone, so such cases are excluded conservatively. `actionlint` is the
// compensating control: it parses the workflow schema properly, checks
// expressions and `runs-on` labels, and shellchecks `run:` blocks, and it is a
// required gate.

const WORKFLOW_DIR = '.github/workflows'
const CI_WORKFLOW = `${WORKFLOW_DIR}/ci.yml`
const PACKAGE_WORKFLOW = `${WORKFLOW_DIR}/package-macos.yml`
const DEPENDABOT = '.github/dependabot.yml'
const GATES_MANIFEST = 'scripts/gates.json'
const RUNNER = 'scripts/run-gates.mjs'
const LINT_WORKFLOWS = 'scripts/lint-workflows.sh'
const ACTIONLINT_PINS = 'scripts/actionlint.sha256'

const PINNED_USES = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\/[^@\s]+)?@[0-9a-f]{40}$/
const REQUIRED_ECOSYSTEMS = ['github-actions', 'npm', 'cargo']
const ACTIONLINT_PLATFORMS = ['darwin_arm64', 'linux_amd64']

/** Every `run:` command line in a file, as {line, command} with 1-indexed lines. */
export function runCommands(text) {
  const lines = text.split('\n')
  const commands = []
  let blockIndent = null

  lines.forEach((raw, index) => {
    if (blockIndent !== null) {
      const indent = raw.length - raw.trimStart().length
      if (raw.trim() === '') return
      if (indent >= blockIndent) {
        // A multi-line run: block is compared line by line on the same
        // whole-line basis, so a gate hidden inside a block scalar is caught
        // and a cd or tar line inside one is still ignored.
        commands.push({ line: index + 1, command: raw.trim() })
        return
      }
      blockIndent = null
    }
    const inline = raw.match(/^\s*-?\s*run:\s*(.+?)\s*$/)
    if (inline) {
      if (/^[|>][-+0-9]*$/.test(inline[1])) {
        blockIndent = raw.length - raw.trimStart().length + 1
        return
      }
      commands.push({ line: index + 1, command: inline[1].trim() })
    }
  })
  return commands
}

/** Every `uses:` value in a file, ignoring commented-out lines. */
export function usesEntries(text) {
  const entries = []
  text.split('\n').forEach((raw, index) => {
    if (/^\s*#/.test(raw)) return
    const match = raw.match(/^\s*-?\s*uses:\s*(.+?)\s*$/)
    if (!match) return
    const rest = match[1]
    // A quoted value cannot be told from a real one by shape; actionlint covers it.
    if (/^['"]/.test(rest)) return
    const [value, ...commentParts] = rest.split('#')
    entries.push({
      line: index + 1,
      value: value.trim(),
      comment: commentParts.length ? commentParts.join('#').trim() : null,
    })
  })
  return entries
}

/** The 1-indexed line of the block that declares a named job, or -1. */
function jobLine(text, job) {
  const lines = text.split('\n')
  const index = lines.findIndex(l => new RegExp(`^\\s{2}${job}:\\s*$`).test(l))
  return index === -1 ? -1 : index + 1
}

/** The line range a named job spans, or null. */
function jobRange(text, job) {
  const start = jobLine(text, job)
  if (start === -1) return null
  const lines = text.split('\n')
  let end = lines.length
  for (let i = start; i < lines.length; i += 1) {
    if (/^\s{2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break }
  }
  return { start, end }
}

function checkPins(ctx, findings) {
  for (const file of ctx.listWorkflowFiles()) {
    const text = ctx.readText(file)
    if (text === null) continue
    for (const entry of usesEntries(text)) {
      if (!PINNED_USES.test(entry.value)) {
        findings.push(finding({
          message: `${file} uses a mutable action reference instead of an immutable commit`,
          file,
          line: entry.line,
          evidence: entry.value,
        }))
        continue
      }
      if (!entry.comment) {
        findings.push(finding({
          message: `${file} pins an action with no version comment, so a reader cannot tell what the SHA is`,
          file,
          line: entry.line,
          evidence: entry.value,
        }))
      }
    }
  }
}

function checkNoTagTrigger(ctx, findings) {
  const text = ctx.readText(PACKAGE_WORKFLOW)
  if (text === null) {
    findings.push(finding({ message: `${PACKAGE_WORKFLOW} is missing`, file: PACKAGE_WORKFLOW }))
    return
  }
  text.split('\n').forEach((raw, index) => {
    if (/^\s*push:\s*$/.test(raw)) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} declares a push trigger; packaging is manual dispatch only`,
        file: PACKAGE_WORKFLOW,
        line: index + 1,
      }))
    }
    if (/^\s*tags:\s*$/.test(raw)) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} declares a tags trigger; the v* tag trigger does not come back until a signing pipeline exists`,
        file: PACKAGE_WORKFLOW,
        line: index + 1,
      }))
    }
  })
}

function checkDependabot(ctx, findings) {
  const text = ctx.readText(DEPENDABOT)
  if (text === null) {
    findings.push(finding({ message: `${DEPENDABOT} is missing`, file: DEPENDABOT }))
    return
  }
  const ecosystems = [...text.matchAll(/^\s*-?\s*package-ecosystem:\s*["']?([A-Za-z-]+)["']?\s*$/gm)]
    .map(m => m[1])
  for (const ecosystem of REQUIRED_ECOSYSTEMS) {
    if (!ecosystems.includes(ecosystem)) {
      findings.push(finding({
        message: `${DEPENDABOT} does not watch the ${ecosystem} ecosystem`,
        file: DEPENDABOT,
      }))
    }
  }
  for (const ecosystem of ecosystems) {
    if (!REQUIRED_ECOSYSTEMS.includes(ecosystem)) {
      findings.push(finding({
        message: `${DEPENDABOT} watches an unexpected ecosystem: ${ecosystem}`,
        file: DEPENDABOT,
        evidence: ecosystem,
      }))
    }
  }
  const targets = [...text.matchAll(/^\s*target-branch:\s*["']?([^"'\s]+)["']?\s*$/gm)].map(m => m[1])
  if (targets.length !== ecosystems.length || targets.some(t => t !== 'main')) {
    findings.push(finding({
      message: `${DEPENDABOT} must set target-branch: main on every ecosystem`,
      file: DEPENDABOT,
      evidence: targets.join(', ') || '(none)',
    }))
  }
}

/**
 * Gate parity through one shared runner.
 *
 * This is where the check gets its machine-readable boundary: a gate step IS a
 * run-gates.mjs invocation and nothing else is. Status, build, and archive
 * commands are outside the comparison entirely — they neither satisfy parity
 * nor violate it. Matching is on the whole trimmed command line, never a
 * substring, so `echo "gates run via scripts/run-gates.mjs"` does not satisfy a
 * presence check and `echo npm run lint` does not trip the duplicate check.
 */
function checkGateParity(ctx, findings) {
  const manifestRead = ctx.readJson(GATES_MANIFEST)
  if (!manifestRead.ok) {
    findings.push(finding({
      message: manifestRead.reason === 'missing'
        ? `${GATES_MANIFEST} is missing, so there is no canonical gate list`
        : `${GATES_MANIFEST} is not valid JSON`,
      file: GATES_MANIFEST,
    }))
    return
  }
  const manifest = manifestRead.value
  const groups = Object.keys(manifest)
  const allGateCommands = new Set(groups.flatMap(g => manifest[g] ?? []))

  const invocation = group => `node ${RUNNER} ${group}`

  const ci = ctx.readText(CI_WORKFLOW)
  if (ci === null) {
    findings.push(finding({ message: `${CI_WORKFLOW} is missing`, file: CI_WORKFLOW }))
  } else {
    for (const [job, group] of [['frontend', 'frontend'], ['rust', 'rust']]) {
      const range = jobRange(ci, job)
      if (!range) {
        findings.push(finding({ message: `${CI_WORKFLOW} declares no ${job} job`, file: CI_WORKFLOW }))
        continue
      }
      const found = runCommands(ci).some(
        c => c.command === invocation(group) && c.line > range.start && c.line <= range.end
      )
      if (!found) {
        findings.push(finding({
          message: `the ${job} job of ${CI_WORKFLOW} does not run "${invocation(group)}"`,
          file: CI_WORKFLOW,
        }))
      }
    }
  }

  const pkg = ctx.readText(PACKAGE_WORKFLOW)
  if (pkg !== null) {
    const commands = runCommands(pkg)
    const lineOf = command => commands.find(c => c.command === command)?.line ?? -1
    const frontendLine = lineOf(invocation('frontend'))
    const rustLine = lineOf(invocation('rust'))
    const buildLine = commands.find(c => c.command === 'npm run tauri:build')?.line ?? -1

    if (frontendLine === -1) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} does not run "${invocation('frontend')}"`,
        file: PACKAGE_WORKFLOW,
      }))
    }
    // Asserting only the frontend group would leave the largest hole open: a
    // packaging run that builds a Rust binary without ever running cargo check.
    if (rustLine === -1) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} does not run "${invocation('rust')}", so it would package without the Rust gate CI enforces`,
        file: PACKAGE_WORKFLOW,
      }))
    }
    if (frontendLine !== -1 && rustLine !== -1 && frontendLine > rustLine) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} runs the rust gate group before the frontend group`,
        file: PACKAGE_WORKFLOW,
        evidence: `frontend at line ${frontendLine}, rust at line ${rustLine}`,
      }))
    }
    for (const [group, line] of [['frontend', frontendLine], ['rust', rustLine]]) {
      if (line !== -1 && buildLine !== -1 && line > buildLine) {
        findings.push(finding({
          message: `${PACKAGE_WORKFLOW} runs the ${group} gate group after the bundle build`,
          file: PACKAGE_WORKFLOW,
          evidence: `${group} at line ${line}, build at line ${buildLine}`,
        }))
      }
    }
  }

  // A hand-spelled second copy is the drift the manifest exists to prevent, so
  // it is a finding even when it happens to match the manifest today.
  for (const file of ctx.listWorkflowFiles()) {
    const text = ctx.readText(file)
    if (text === null) continue
    for (const { line, command } of runCommands(text)) {
      if (allGateCommands.has(command)) {
        findings.push(finding({
          message: `${file} spells out a gate command that belongs to ${GATES_MANIFEST}`,
          file,
          line,
          evidence: command,
        }))
      }
    }
  }

  // Neither side may carry a group the other does not.
  const invokedGroups = new Set()
  for (const file of ctx.listWorkflowFiles()) {
    const text = ctx.readText(file)
    if (text === null) continue
    for (const { line, command } of runCommands(text)) {
      const match = command.match(new RegExp(`^node ${RUNNER.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} ([A-Za-z0-9_-]+)$`))
      if (!match) continue
      invokedGroups.add(match[1])
      if (!groups.includes(match[1])) {
        findings.push(finding({
          message: `${file} invokes gate group "${match[1]}", which ${GATES_MANIFEST} does not define`,
          file,
          line,
          evidence: command,
        }))
      }
    }
  }
  for (const group of groups) {
    if (!invokedGroups.has(group)) {
      findings.push(finding({
        message: `${GATES_MANIFEST} defines gate group "${group}", which no workflow invokes`,
        file: GATES_MANIFEST,
        evidence: group,
      }))
    }
  }
}

function checkVerifierInvocation(ctx, findings) {
  const text = ctx.readText(PACKAGE_WORKFLOW)
  if (text === null) return

  const invocations = runCommands(text).filter(c => c.command.startsWith('npm run verify:package'))
  if (invocations.length === 0) {
    findings.push(finding({
      message: `${PACKAGE_WORKFLOW} does not run the package verifier`,
      file: PACKAGE_WORKFLOW,
    }))
  }
  for (const { line, command } of invocations) {
    // A bare invocation would not be the command the local run uses, and the
    // local-equivalence claim behind it would be false.
    const argument = command.replace(/^npm run verify:package\s*/, '')
    if (!/^--\s+\S/.test(argument)) {
      findings.push(finding({
        message: `${PACKAGE_WORKFLOW} runs the package verifier without a bundle-root argument`,
        file: PACKAGE_WORKFLOW,
        line,
        evidence: command,
      }))
    }
  }

  const manifest = ctx.readJson('package.json')
  if (manifest.ok && typeof manifest.value.scripts?.['verify:package'] !== 'string') {
    findings.push(finding({
      message: 'package.json declares no "verify:package" script',
      file: 'package.json',
    }))
  }
}

function checkActionlintPin(ctx, findings) {
  const script = ctx.readText(LINT_WORKFLOWS)
  if (script === null) {
    findings.push(finding({ message: `${LINT_WORKFLOWS} is missing`, file: LINT_WORKFLOWS }))
  } else if (!script.includes('actionlint.sha256')) {
    findings.push(finding({
      message: `${LINT_WORKFLOWS} does not reference the committed checksum file`,
      file: LINT_WORKFLOWS,
    }))
  }

  const pins = ctx.readText(ACTIONLINT_PINS)
  if (pins === null) {
    findings.push(finding({ message: `${ACTIONLINT_PINS} is missing`, file: ACTIONLINT_PINS }))
    return
  }
  if (!/^ACTIONLINT_VERSION=1\.7\.12$/m.test(pins)) {
    findings.push(finding({
      message: `${ACTIONLINT_PINS} does not pin actionlint 1.7.12`,
      file: ACTIONLINT_PINS,
    }))
  }
  for (const platform of ACTIONLINT_PLATFORMS) {
    if (!new RegExp(`^[0-9a-f]{64}\\s+\\S*${platform}\\S*$`, 'm').test(pins)) {
      findings.push(finding({
        message: `${ACTIONLINT_PINS} pins no digest for ${platform}, so the gate could decay into an unpinned download there`,
        file: ACTIONLINT_PINS,
      }))
    }
  }
}

export const actionPinsRule = {
  id: 'action-pins',
  title: 'Workflows pin immutable actions, run the shared gate manifest, and package by dispatch only',
  check(ctx) {
    const findings = []
    checkPins(ctx, findings)
    checkNoTagTrigger(ctx, findings)
    checkDependabot(ctx, findings)
    checkGateParity(ctx, findings)
    checkVerifierInvocation(ctx, findings)
    checkActionlintPin(ctx, findings)
    return findings
  },
}
