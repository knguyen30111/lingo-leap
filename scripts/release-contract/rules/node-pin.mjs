import { finding } from '../lib/findings.mjs'
import { requiredNpmScripts } from '../lib/gate-contract.mjs'

// Every gate this repository claims to run has to be invocable by name, and
// every surface that installs Node has to install the one `.nvmrc` pins. Both
// are read from tracked files only: no network, no node_modules, no build
// output, so the rule runs on a clean checkout before anything is built.

// Scripts the gate contract names, derived from it rather than copied. A gate
// the contract requires that package.json does not define is the failure this
// assertion exists to catch — it is what makes the executable-gate claim
// structural rather than documentary.
const REQUIRED_SCRIPTS = requiredNpmScripts()

const ACTIONLINT_PLATFORMS = ['darwin_arm64', 'linux_amd64']

function checkNvmrc(ctx, findings) {
  const text = ctx.readText('.nvmrc')
  if (text === null) {
    findings.push(finding({ message: '.nvmrc is missing, so no Node version is pinned', file: '.nvmrc' }))
    return null
  }
  const value = text.trim()
  if (!/^\d+$/.test(value)) {
    findings.push(finding({
      message: '.nvmrc must contain a single bare major version',
      file: '.nvmrc',
      evidence: JSON.stringify(value),
    }))
    return null
  }
  return value
}

function checkDockerfile(ctx, major, findings) {
  const lines = ctx.readLines('Dockerfile.linux')
  if (lines === null) {
    findings.push(finding({ message: 'Dockerfile.linux is missing', file: 'Dockerfile.linux' }))
    return
  }
  if (major === null) return

  let sawSetup = false
  lines.forEach((line, index) => {
    const setup = line.match(/setup_(\d+)\.x/)
    if (setup) {
      sawSetup = true
      if (setup[1] !== major) {
        findings.push(finding({
          message: `Dockerfile.linux installs Node ${setup[1]} but .nvmrc pins ${major}`,
          file: 'Dockerfile.linux',
          line: index + 1,
          evidence: line.trim(),
        }))
      }
    }
    const comment = line.match(/Node\.js\s+(\d+)/)
    if (comment && comment[1] !== major) {
      findings.push(finding({
        message: `Dockerfile.linux comment says Node.js ${comment[1]} but .nvmrc pins ${major}`,
        file: 'Dockerfile.linux',
        line: index + 1,
        evidence: line.trim(),
      }))
    }
  })

  if (!sawSetup) {
    findings.push(finding({
      message: 'Dockerfile.linux installs Node from no recognisable NodeSource setup script',
      file: 'Dockerfile.linux',
    }))
  }
}

function checkWorkflowNodeVersions(ctx, findings) {
  for (const file of ctx.listWorkflowFiles()) {
    const lines = ctx.readLines(file)
    if (lines === null) continue

    let setsUpNode = false
    let usesVersionFile = false
    lines.forEach((line, index) => {
      if (/uses:\s*actions\/setup-node[@\s]/.test(line)) setsUpNode = true
      if (/^\s*node-version-file:\s*\.nvmrc\s*$/.test(line)) usesVersionFile = true
      if (/^\s*node-version:\s*\S/.test(line)) {
        findings.push(finding({
          message: `${file} pins a literal Node version instead of node-version-file: .nvmrc`,
          file,
          line: index + 1,
          evidence: line.trim(),
        }))
      }
    })

    if (setsUpNode && !usesVersionFile) {
      findings.push(finding({
        message: `${file} sets up Node without node-version-file: .nvmrc`,
        file,
      }))
    }
  }
}

function checkScripts(ctx, findings) {
  const manifest = ctx.readJson('package.json')
  if (!manifest.ok) {
    findings.push(finding({
      message: manifest.reason === 'missing' ? 'package.json is missing' : 'package.json is not valid JSON',
      file: 'package.json',
      evidence: manifest.error,
    }))
    return
  }

  const scripts = manifest.value.scripts ?? {}
  for (const name of REQUIRED_SCRIPTS) {
    if (typeof scripts[name] !== 'string' || scripts[name].trim() === '') {
      findings.push(finding({
        message: `package.json declares no "${name}" script, so a gate list that names it cannot run`,
        file: 'package.json',
      }))
    }
  }

  // typecheck and build must stay separate, or a type error is reported as a
  // bundler failure and the typecheck gate asserts nothing on its own.
  const build = scripts.build
  if (typeof build === 'string' && /(^|[\s&|;])tsc([\s&|;]|$)/.test(build)) {
    findings.push(finding({
      message: 'the build script invokes tsc; type checking belongs to the typecheck gate',
      file: 'package.json',
      evidence: `"build": ${JSON.stringify(build)}`,
    }))
  }
  const typecheck = scripts.typecheck
  if (typeof typecheck === 'string' && !/tsc\b[^&|;]*--noEmit/.test(typecheck)) {
    findings.push(finding({
      message: 'the typecheck script must run tsc --noEmit',
      file: 'package.json',
      evidence: `"typecheck": ${JSON.stringify(typecheck)}`,
    }))
  }
}

function checkActionlintPin(ctx, findings) {
  const file = 'scripts/actionlint.sha256'
  const text = ctx.readText(file)
  if (text === null) {
    findings.push(finding({
      message: 'the pinned actionlint checksum file is missing, so the workflow-lint gate would be an unpinned download',
      file,
    }))
    return
  }

  const version = text.match(/^ACTIONLINT_VERSION=(\S+)$/m)
  if (!version) {
    findings.push(finding({ message: 'the actionlint checksum file pins no ACTIONLINT_VERSION', file }))
  }

  // Both platforms are required: pinning only one leaves the other — which may
  // be the CI runner — with nothing to verify against.
  for (const platform of ACTIONLINT_PLATFORMS) {
    const pattern = new RegExp(`^([0-9a-f]{64})\\s+\\S*${platform}\\S*$`, 'm')
    if (!pattern.test(text)) {
      findings.push(finding({
        message: `the actionlint checksum file pins no 64-hex digest for ${platform}`,
        file,
      }))
    }
  }
}

export const nodePinRule = {
  id: 'node-pin',
  title: 'Node version pin and executable gate scripts agree across every surface',
  check(ctx) {
    const findings = []
    const major = checkNvmrc(ctx, findings)
    checkDockerfile(ctx, major, findings)
    checkWorkflowNodeVersions(ctx, findings)
    checkScripts(ctx, findings)
    checkActionlintPin(ctx, findings)
    return findings
  },
}
