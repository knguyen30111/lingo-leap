import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'

// The native authority the frontend is permitted to exercise, and the
// dependencies that could restore the authority removed with it.
//
// A capability list can be tightened while the plugin sits in the manifest
// waiting to be re-enabled, so this rule checks the manifests and the source as
// well as the capability files. It reads the Cargo *manifest*, never the
// lockfile: several of these crates legitimately remain in the lockfile as
// tauri's own transitive dependencies, so a lockfile assertion would be false.

const CAPABILITIES_DIR = 'src-tauri/capabilities'
const DEFAULT_CAPABILITY = `${CAPABILITIES_DIR}/default.json`
const DESKTOP_CAPABILITY = `${CAPABILITIES_DIR}/desktop.json`
const CARGO_MANIFEST = 'src-tauri/Cargo.toml'
const RUST_ENTRY = 'src-tauri/src/lib.rs'
const PACKAGE_MANIFEST = 'package.json'

export const ALLOWED_PERMISSIONS = [
  'core:event:allow-listen',
  'core:event:allow-unlisten',
  'core:window:allow-hide',
  'core:window:allow-set-always-on-top',
  'clipboard-manager:allow-write-text',
]

const FORBIDDEN_PERMISSION_PATTERNS = [
  /^core:default$/,
  /^shell:/,
  /^global-shortcut:/,
  /^positioner:/,
  /^clipboard-manager:allow-read/,
]

const FORBIDDEN_CARGO_DEPENDENCIES = [
  'tauri-plugin-shell',
  'tauri-plugin-global-shortcut',
  'tauri-plugin-positioner',
  'reqwest',
  'tokio',
  'serde',
  'serde_json',
]

const FORBIDDEN_RUST_SYMBOLS = [
  'tauri_plugin_shell',
  'tauri_plugin_global_shortcut',
  'tauri_plugin_positioner',
]

const FORBIDDEN_NPM_DEPENDENCIES = [
  '@tauri-apps/plugin-shell',
  '@tauri-apps/plugin-global-shortcut',
  '@tauri-apps/plugin-positioner',
]

function listCapabilityFiles(root) {
  const dir = path.join(root, CAPABILITIES_DIR)
  try {
    return fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

/** Every non-test .ts/.tsx file under src/, repo-relative. */
function listSourceFiles(root, relative = 'src', out = []) {
  const dir = path.join(root, relative)
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return out
    throw err
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${relative}/${entry.name}`
    if (entry.isDirectory()) {
      listSourceFiles(root, child, out)
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    out.push(child)
  }
  return out
}

function sameSet(actual, expected) {
  const a = [...new Set(actual)].sort()
  const b = [...new Set(expected)].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function checkDefaultCapability(ctx, findings) {
  const capability = ctx.readJson(DEFAULT_CAPABILITY)
  if (!capability.ok) {
    findings.push(finding({
      message: capability.reason === 'missing'
        ? `${DEFAULT_CAPABILITY} is missing`
        : `${DEFAULT_CAPABILITY} is not valid JSON`,
      file: DEFAULT_CAPABILITY,
      evidence: capability.error,
    }))
    return
  }
  const permissions = capability.value.permissions ?? []
  if (!sameSet(permissions, ALLOWED_PERMISSIONS)) {
    const extra = permissions.filter(p => !ALLOWED_PERMISSIONS.includes(p))
    const missing = ALLOWED_PERMISSIONS.filter(p => !permissions.includes(p))
    findings.push(finding({
      message: 'the default capability must grant exactly the five permissions the frontend uses',
      file: DEFAULT_CAPABILITY,
      evidence: [
        extra.length ? `unexpected: ${extra.join(', ')}` : null,
        missing.length ? `missing: ${missing.join(', ')}` : null,
      ].filter(Boolean).join('; '),
    }))
  }
}

function checkNoDesktopCapability(ctx, findings) {
  if (ctx.exists(DESKTOP_CAPABILITY)) {
    findings.push(finding({
      message: `${DESKTOP_CAPABILITY} grants only plugins this app does not use and must not exist`,
      file: DESKTOP_CAPABILITY,
    }))
  }
}

function checkForbiddenPermissions(ctx, findings) {
  for (const name of listCapabilityFiles(ctx.root)) {
    const file = `${CAPABILITIES_DIR}/${name}`
    const capability = ctx.readJson(file)
    if (!capability.ok) continue
    for (const permission of capability.value.permissions ?? []) {
      const id = typeof permission === 'string' ? permission : permission?.identifier
      if (typeof id !== 'string') continue
      if (FORBIDDEN_PERMISSION_PATTERNS.some(pattern => pattern.test(id))) {
        findings.push(finding({
          message: `${file} grants ${id}, which is authority this app does not use`,
          file,
          evidence: id,
        }))
      }
    }
  }
}

function checkCargoManifest(ctx, findings) {
  const lines = ctx.readLines(CARGO_MANIFEST)
  if (lines === null) {
    findings.push(finding({ message: `${CARGO_MANIFEST} is missing`, file: CARGO_MANIFEST }))
    return
  }

  let inDependencyTable = false
  lines.forEach((line, index) => {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (table) {
      // Any [dependencies] table, including a [target.'cfg(...)'.dependencies]
      // one, but never [build-dependencies].
      inDependencyTable = /(^|\.)dependencies$/.test(table[1]) && !/build-dependencies$/.test(table[1])
      return
    }
    if (!inDependencyTable) return
    const entry = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)
    if (!entry) return
    if (FORBIDDEN_CARGO_DEPENDENCIES.includes(entry[1])) {
      findings.push(finding({
        message: `${CARGO_MANIFEST} declares ${entry[1]} as a direct dependency, but no Rust source references it`,
        file: CARGO_MANIFEST,
        line: index + 1,
        evidence: line.trim(),
      }))
    }
  })
}

function checkRustEntry(ctx, findings) {
  const lines = ctx.readLines(RUST_ENTRY)
  if (lines === null) {
    findings.push(finding({ message: `${RUST_ENTRY} is missing`, file: RUST_ENTRY }))
    return
  }
  lines.forEach((line, index) => {
    for (const symbol of FORBIDDEN_RUST_SYMBOLS) {
      if (line.includes(symbol)) {
        findings.push(finding({
          message: `${RUST_ENTRY} still registers ${symbol}`,
          file: RUST_ENTRY,
          line: index + 1,
          evidence: line.trim(),
        }))
      }
    }
  })
}

function checkNpmManifest(ctx, findings) {
  const manifest = ctx.readJson(PACKAGE_MANIFEST)
  if (!manifest.ok) {
    findings.push(finding({
      message: manifest.reason === 'missing' ? 'package.json is missing' : 'package.json is not valid JSON',
      file: PACKAGE_MANIFEST,
    }))
    return
  }
  const dependencies = manifest.value.dependencies ?? {}
  for (const name of FORBIDDEN_NPM_DEPENDENCIES) {
    if (name in dependencies) {
      findings.push(finding({
        message: `package.json depends on ${name}, which no source file imports`,
        file: PACKAGE_MANIFEST,
        evidence: `"${name}": ${JSON.stringify(dependencies[name])}`,
      }))
    }
  }
}

function checkSourceImports(ctx, findings) {
  for (const file of listSourceFiles(ctx.root)) {
    const lines = ctx.readLines(file)
    if (lines === null) continue
    lines.forEach((line, index) => {
      for (const name of FORBIDDEN_NPM_DEPENDENCIES) {
        if (line.includes(name)) {
          findings.push(finding({
            message: `${file} references ${name}`,
            file,
            line: index + 1,
            evidence: line.trim(),
          }))
        }
      }
      if (/\breadText\b/.test(line)) {
        findings.push(finding({
          message: `${file} references clipboard readText, which the capability set does not permit`,
          file,
          line: index + 1,
          evidence: line.trim(),
        }))
      }
    })
  }
}

export const nativeAuthorityRule = {
  id: 'native-authority',
  title: 'The native authority surface is the permissions and plugins the frontend actually uses',
  check(ctx) {
    const findings = []
    checkDefaultCapability(ctx, findings)
    checkNoDesktopCapability(ctx, findings)
    checkForbiddenPermissions(ctx, findings)
    checkCargoManifest(ctx, findings)
    checkRustEntry(ctx, findings)
    checkNpmManifest(ctx, findings)
    checkSourceImports(ctx, findings)
    return findings
  },
}
