import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'

// The governance surface a contributor arriving cold needs, plus the two things
// that make it stay true: no personal contact address anywhere in it, and no
// relative link that points at a file which does not exist.

// A byte floor rather than mere existence, so an empty placeholder fails.
export const REQUIRED_DOCUMENTS = [
  { file: 'LICENSE', minBytes: 1000 },
  { file: 'CONTRIBUTING.md', minBytes: 800 },
  { file: 'CODE_OF_CONDUCT.md', minBytes: 800 },
  { file: 'SECURITY.md', minBytes: 800 },
  { file: 'docs/system-architecture.md', minBytes: 800 },
  { file: 'docs/privacy.md', minBytes: 800 },
  { file: 'docs/release.md', minBytes: 800 },
]

const LICENSE_FRAGMENTS = [
  'MIT License',
  'Copyright (c) 2026 Lingo Leap contributors',
  'WITHOUT WARRANTY OF ANY KIND',
]

// The phrase SECURITY.md owns for the case where the private-reporting button
// is not present. Checked alongside the reference to private reporting itself,
// so the document stays actionable while the repository setting is off.
const PRIVATE_REPORTING_REFERENCE = /private vulnerability reporting/i
const FALLBACK_PHRASE = /if that button is not present/i

// Conservative: a local part, an @, a dotted domain, and a TLD of at least two
// letters. A bare "@mention" or a URL does not match.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

const README_REQUIRED_LINKS = ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/privacy.md']

/** Relative markdown link targets, with pure fragments and absolute URLs ignored. */
export function relativeLinkTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue   // http:, https:, mailto:
    if (raw.startsWith('#')) continue                 // pure fragment
    const withoutFragment = raw.split('#')[0]
    if (withoutFragment === '') continue
    targets.push(withoutFragment)
  }
  return targets
}

function listDocsFiles(root) {
  const dir = path.join(root, 'docs')
  try {
    return fs.readdirSync(dir).filter(name => name.endsWith('.md')).sort().map(name => `docs/${name}`)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

export const governanceRule = {
  id: 'governance',
  title: 'Licence, contribution, conduct, security, architecture, privacy, and release documents exist and stay resolvable',
  check(ctx) {
    const findings = []

    for (const { file, minBytes } of REQUIRED_DOCUMENTS) {
      const text = ctx.readText(file)
      if (text === null) {
        findings.push(finding({ message: `${file} is missing`, file }))
        continue
      }
      if (Buffer.byteLength(text, 'utf8') < minBytes) {
        findings.push(finding({
          message: `${file} is too short to be a real document`,
          file,
          evidence: `${Buffer.byteLength(text, 'utf8')} bytes < ${minBytes}`,
        }))
      }
    }

    const license = ctx.readText('LICENSE')
    if (license !== null) {
      for (const fragment of LICENSE_FRAGMENTS) {
        if (!license.includes(fragment)) {
          findings.push(finding({
            message: `LICENSE does not contain the canonical fragment "${fragment}"`,
            file: 'LICENSE',
          }))
        }
      }
    }

    const security = ctx.readText('SECURITY.md')
    if (security !== null) {
      if (!PRIVATE_REPORTING_REFERENCE.test(security)) {
        findings.push(finding({
          message: 'SECURITY.md does not reference GitHub private vulnerability reporting',
          file: 'SECURITY.md',
        }))
      }
      // Naming only the button would point at a control that may be off.
      if (!FALLBACK_PHRASE.test(security)) {
        findings.push(finding({
          message: 'SECURITY.md describes no fallback for when private vulnerability reporting is unavailable',
          file: 'SECURITY.md',
        }))
      }
    }

    for (const { file } of REQUIRED_DOCUMENTS) {
      const text = ctx.readText(file)
      if (text === null) continue
      const match = text.match(EMAIL)
      if (match) {
        findings.push(finding({
          message: `${file} contains an email address; governance docs use GitHub-native paths only`,
          file,
          evidence: match[0],
        }))
      }
    }

    const readme = ctx.readText('README.md')
    if (readme === null) {
      findings.push(finding({ message: 'README.md is missing', file: 'README.md' }))
    } else {
      for (const link of README_REQUIRED_LINKS) {
        if (!readme.includes(link)) {
          findings.push(finding({ message: `README.md does not link ${link}`, file: 'README.md' }))
        }
      }
    }

    // Keeps the docs from rotting silently as files move.
    for (const file of ['README.md', ...listDocsFiles(ctx.root)]) {
      const text = ctx.readText(file)
      if (text === null) continue
      const base = path.dirname(file)
      for (const target of relativeLinkTargets(text)) {
        const resolved = target.startsWith('/')
          ? path.join(ctx.root, target)
          : path.join(ctx.root, base, target)
        if (!fs.existsSync(resolved)) {
          findings.push(finding({
            message: `${file} links ${target}, which does not exist`,
            file,
            evidence: target,
          }))
        }
      }
    }

    return findings
  },
}
