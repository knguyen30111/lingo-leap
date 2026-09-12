import { finding } from '../lib/findings.mjs'

// Release identity: every version authority agrees, the macOS floor is declared
// and matches the README, the meaningless empty ATS exception is gone, and a
// tag build cannot disagree with the repository silently.

const PACKAGE_MANIFEST = 'package.json'
const PACKAGE_LOCK = 'package-lock.json'
const CONFIG = 'src-tauri/tauri.conf.json'
const CARGO_MANIFEST = 'src-tauri/Cargo.toml'
const CARGO_LOCK = 'src-tauri/Cargo.lock'
const README = 'README.md'

// No prerelease, no build metadata: a tag carrying either could never agree
// with a version authority, so both are rejected in both places.
const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const STALE_AUTHOR_NAMES = ['TranApp', 'TranObserve']

function cargoPackageVersion(text) {
  const section = text.match(/\[package\][\s\S]*?(?=\n\[|$)/)
  if (!section) return null
  const version = section[0].match(/^\s*version\s*=\s*"([^"]*)"/m)
  return version ? version[1] : null
}

function cargoPackageField(text, field) {
  const section = text.match(/\[package\][\s\S]*?(?=\n\[|$)/)
  if (!section) return null
  const match = section[0].match(new RegExp(`^\\s*${field}\\s*=\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

function cargoLockVersion(text) {
  const entry = text.match(/name = "tran-app"\s*\nversion = "([^"]*)"/)
  return entry ? entry[1] : null
}

function collectVersions(ctx) {
  const sources = []

  const manifest = ctx.readJson(PACKAGE_MANIFEST)
  sources.push({ label: `${PACKAGE_MANIFEST} version`, file: PACKAGE_MANIFEST, value: manifest.ok ? manifest.value.version ?? null : null })

  const lock = ctx.readJson(PACKAGE_LOCK)
  sources.push({ label: `${PACKAGE_LOCK} root version`, file: PACKAGE_LOCK, value: lock.ok ? lock.value.version ?? null : null })
  sources.push({
    label: `${PACKAGE_LOCK} packages[""].version`,
    file: PACKAGE_LOCK,
    value: lock.ok ? lock.value.packages?.['']?.version ?? null : null,
  })

  const config = ctx.readJson(CONFIG)
  sources.push({ label: `${CONFIG} version`, file: CONFIG, value: config.ok ? config.value.version ?? null : null })

  const cargo = ctx.readText(CARGO_MANIFEST)
  sources.push({ label: `${CARGO_MANIFEST} [package].version`, file: CARGO_MANIFEST, value: cargo === null ? null : cargoPackageVersion(cargo) })

  const cargoLock = ctx.readText(CARGO_LOCK)
  sources.push({ label: `${CARGO_LOCK} tran-app version`, file: CARGO_LOCK, value: cargoLock === null ? null : cargoLockVersion(cargoLock) })

  return sources
}

/**
 * Resolves the tag under check.
 *
 * The three failure shapes below are separate branches on purpose. A parser
 * that reads `argv[argv.indexOf('--tag') + 1]` yields `undefined` for a bare
 * trailing `--tag`, and a truthiness check then turns the most dangerous input
 * — a release build asking to be checked — into a silent skip.
 *
 * @returns {{state: 'none'|'error'|'value', message?: string, value?: string, source?: string}}
 */
export function resolveTagContext(argv = [], env = {}) {
  const flagIndex = argv.indexOf('--tag')
  let fromFlag = null

  if (flagIndex !== -1) {
    if (flagIndex === argv.length - 1) {
      return { state: 'error', message: '--tag was supplied with no value' }
    }
    const next = argv[flagIndex + 1]
    if (typeof next === 'string' && next.startsWith('--')) {
      return { state: 'error', message: '--tag was supplied with no value' }
    }
    if (next === '') {
      return { state: 'error', message: '--tag was supplied with an empty value' }
    }
    fromFlag = next
  }

  let fromEnv = null
  if (env.GITHUB_REF_TYPE === 'tag') {
    const name = env.GITHUB_REF_NAME
    if (typeof name !== 'string' || name === '') {
      return {
        state: 'error',
        message: 'GITHUB_REF_TYPE is tag but GITHUB_REF_NAME is unset or empty, so the build cannot say which tag it is releasing',
      }
    }
    fromEnv = name
  }

  if (fromFlag !== null && fromEnv !== null) {
    if (fromFlag !== fromEnv) {
      return {
        state: 'error',
        message: `two tag sources disagree: --tag is ${JSON.stringify(fromFlag)} but GITHUB_REF_NAME is ${JSON.stringify(fromEnv)}`,
      }
    }
    return { state: 'value', value: fromFlag, source: '--tag and GITHUB_REF_NAME' }
  }
  if (fromFlag !== null) return { state: 'value', value: fromFlag, source: '--tag' }
  if (fromEnv !== null) return { state: 'value', value: fromEnv, source: 'GITHUB_REF_NAME' }
  return { state: 'none' }
}

function checkTagPreflight(ctx, agreedVersion, versionsAgree, findings) {
  const context = resolveTagContext(ctx.argv ?? [], ctx.env ?? {})

  if (context.state === 'none') {
    // The skip must be visible: a preflight that silently does nothing is
    // indistinguishable from one that is broken.
    ctx.info?.('tag preflight: skipped — no tag context (no --tag argument and GITHUB_REF_TYPE is not "tag")')
    return
  }

  if (context.state === 'error') {
    findings.push(finding({ message: `tag preflight: ${context.message}` }))
    return
  }

  ctx.info?.(`tag preflight: checking ${context.value} (from ${context.source})`)

  const tag = context.value
  if (!tag.startsWith('v') || !STRICT_SEMVER.test(tag.slice(1))) {
    findings.push(finding({
      message: 'tag preflight: the tag must be "v" followed by a plain semver version, with no prerelease or build metadata',
      evidence: JSON.stringify(tag),
    }))
    return
  }

  // A tag is never reported as agreeing with a version the other assertions
  // already found inconsistent.
  if (!versionsAgree) return

  if (tag.slice(1) !== agreedVersion) {
    findings.push(finding({
      message: `tag preflight: tag ${tag} does not match the agreed version ${agreedVersion}`,
      evidence: `tag=${tag} version=${agreedVersion}`,
    }))
  }
}

export const releaseIdentityRule = {
  id: 'release-identity',
  title: 'Every version authority agrees, the macOS floor is declared, and a tag cannot disagree silently',
  check(ctx) {
    const findings = []
    const sources = collectVersions(ctx)

    const missing = sources.filter(s => s.value === null)
    for (const source of missing) {
      findings.push(finding({ message: `${source.label} could not be read`, file: source.file }))
    }

    const present = sources.filter(s => s.value !== null)
    const values = [...new Set(present.map(s => s.value))]
    const versionsAgree = missing.length === 0 && values.length === 1
    const agreedVersion = versionsAgree ? values[0] : null

    if (present.length > 0 && values.length > 1) {
      // The most common value is treated as the intended one purely so the
      // finding can name the outliers; nothing depends on the choice.
      const counts = new Map()
      for (const s of present) counts.set(s.value, (counts.get(s.value) ?? 0) + 1)
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      for (const source of present.filter(s => s.value !== majority)) {
        findings.push(finding({
          message: `${source.label} is ${source.value}, disagreeing with the other version authorities`,
          file: source.file,
          evidence: `${source.value} != ${majority}`,
        }))
      }
    }

    for (const source of present) {
      if (!STRICT_SEMVER.test(source.value)) {
        findings.push(finding({
          message: `${source.label} is not a plain semver version (no prerelease or build metadata allowed)`,
          file: source.file,
          evidence: source.value,
        }))
      }
    }

    const config = ctx.readJson(CONFIG)
    const macOS = config.ok ? config.value?.bundle?.macOS ?? {} : {}

    const floor = macOS.minimumSystemVersion
    if (typeof floor !== 'string' || floor.trim() === '') {
      findings.push(finding({
        message: 'bundle.macOS.minimumSystemVersion must be declared; without it the bundler applies its own much older default',
        file: CONFIG,
      }))
    } else {
      const readme = ctx.readText(README)
      if (readme === null) {
        findings.push(finding({ message: `${README} is missing`, file: README }))
      } else {
        const stated = readme.match(/\*\*macOS\*\*\s*(\d+(?:\.\d+)?)\+/)
        if (!stated) {
          findings.push(finding({
            message: `${README} states no macOS minimum version for the rule to cross-check`,
            file: README,
          }))
        } else if (stated[1] !== floor && `${stated[1]}.0` !== floor && stated[1] !== floor.replace(/\.0$/, '')) {
          findings.push(finding({
            message: `${README} promises macOS ${stated[1]}+ but the bundle declares ${floor}`,
            file: README,
            evidence: `README ${stated[1]} != minimumSystemVersion ${floor}`,
          }))
        }
      }
    }

    if ('exceptionDomain' in macOS) {
      const value = macOS.exceptionDomain
      if (typeof value !== 'string' || value.trim() === '') {
        findings.push(finding({
          message: 'bundle.macOS.exceptionDomain is empty, which configures nothing while implying a network exception exists',
          file: CONFIG,
          evidence: JSON.stringify(value),
        }))
      }
    }

    const cargo = ctx.readText(CARGO_MANIFEST)
    if (cargo !== null) {
      const repository = cargoPackageField(cargo, 'repository')
      if (repository === null || /^""$/.test(repository)) {
        findings.push(finding({
          message: 'Cargo.toml declares an empty repository, which publishes a blank provenance claim',
          file: CARGO_MANIFEST,
          evidence: repository ?? '(absent)',
        }))
      }
      const authors = cargoPackageField(cargo, 'authors') ?? ''
      for (const stale of STALE_AUTHOR_NAMES) {
        if (authors.includes(stale)) {
          findings.push(finding({
            message: `Cargo.toml authors still names ${stale}, a leftover from the pre-rename project`,
            file: CARGO_MANIFEST,
            evidence: authors,
          }))
        }
      }
    }

    checkTagPreflight(ctx, agreedVersion, versionsAgree, findings)

    return findings
  },
}
