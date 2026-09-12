import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'
import {
  GATE_GROUPS,
  gateRunnerCommand,
  documentedNpmGateCommands,
} from '../lib/gate-contract.mjs'

function listDocsFiles(root) {
  try {
    return fs.readdirSync(path.join(root, 'docs'))
      .filter(name => name.endsWith('.md'))
      .sort()
      .map(name => `docs/${name}`)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

// Claims the README and CONTRIBUTING.md make, checked against the code rather
// than against prose. The model defaults are read from the store, so changing a
// runtime default forces the documentation to follow instead of letting the two
// drift apart silently.

const README = 'README.md'
const CONTRIBUTING = 'CONTRIBUTING.md'
const SETTINGS_STORE = 'src/stores/settingsStore.ts'
const PACKAGE_MANIFEST = 'package.json'
const SECURITY = 'SECURITY.md'
const PRIVACY = 'docs/privacy.md'
const CACHE_MODULE = 'src/lib/cache.ts'
const I18N_CONFIG = 'src/i18n/config.ts'

const FORBIDDEN_ARTIFACTS = ['.deb', '.rpm', '.AppImage']

// The gate list a contributor has to be able to find, derived from the one
// canonical gate contract rather than written down a second time. Adding a
// required gate therefore makes this check follow on its own.
const DOCUMENTED_GATES = documentedNpmGateCommands()

// The specific overclaims this issue exists to prevent. Prose drifts back
// toward them easily, so they are matched literally.
const FORBIDDEN_CLAIMS = [
  /\bnotariz(ed|ation)\b/i,
  /\bstapled?\b/i,
  /\bDeveloper ID\b/,
  /Gatekeeper[- ]approved/i,
  /ready for distribution/i,
  /safe to distribute/i,
]

// Packaging and rollback overclaims, matched literally for the same reason as
// the list above: each is a phrase a previous draft actually contained, and
// each describes something the repository cannot do.
//
// `verify-package` asserts neither checksums nor artifact sizes, and nothing
// launches or terminates the app; GitHub has no primitive that revokes a
// published asset; and no workflow builds the Linux image.
const FORBIDDEN_PACKAGING_CLAIMS = [
  /\bDocker workflow\b/i,
  /\brevoke the (affected )?release\b/i,
  /artifact names and sizes/i,
  /\bsize enforcement\b/i,
  /(workflow|verifier) launches and terminates/i,
  /\b(verifier|verification) (also )?(asserts?|checks?|computes?)[^.]{0,40}checksum/i,
]

// "Developer ID" and "notarization" are legitimate when the sentence says they
// do NOT exist yet. A line is only a finding when it makes the claim.
//
// The markers are deliberately narrow: a word like "before" or "when" appears
// happily in an affirmative overclaim ("the DMG is notarized before release"),
// so treating it as a denial would hide exactly what this list exists to catch.
const NEGATED_CONTEXT =
  /\b(not|no|never|without|once|until|future|would|planned|requires?|lacks?|absent|cannot)\b/i

export function readModelDefault(storeText, field) {
  const match = storeText.match(new RegExp(`${field}\\s*:\\s*"([^"]+)"`))
  return match ? match[1] : null
}

export function namedNpmScripts(markdown) {
  return [...new Set([...markdown.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map(m => m[1]))]
}

/** The minute count the shared AI result cache is constructed with, or null. */
export function readCacheLifetimeMinutes(cacheSource) {
  const match = cacheSource.match(/new LRUCache<[^>]*>\(\s*\d+\s*,\s*(\d+)\s*\)/)
  return match ? match[1] : null
}

/** The local-storage key the language detector persists, or null. */
export function readUiLanguageKey(i18nSource) {
  const match = i18nSource.match(/lookupLocalStorage:\s*['"]([^'"]+)['"]/)
  return match ? match[1] : null
}

/**
 * What the privacy note has to disclose, read from the code that does it.
 *
 * Both values are things a user cannot see: a second local-storage key the
 * language detector writes, and how long an answer stays in memory. Reading
 * them from source is what stops the note from silently going stale when
 * either changes.
 */
function checkPrivacyDisclosures(ctx, findings) {
  const privacy = ctx.readText(PRIVACY)
  // Governance owns whether the document exists; this rule only checks what it
  // says when it is there.
  if (privacy === null) return

  const cacheSource = ctx.readText(CACHE_MODULE)
  if (cacheSource === null) {
    findings.push(finding({ message: `${CACHE_MODULE} is missing`, file: CACHE_MODULE }))
  } else {
    const minutes = readCacheLifetimeMinutes(cacheSource)
    if (minutes === null) {
      findings.push(finding({
        message: `could not read the response-cache lifetime from ${CACHE_MODULE}`,
        file: CACHE_MODULE,
      }))
    } else if (!new RegExp(`${minutes}\\W{0,4}minutes?`, 'i').test(privacy)) {
      findings.push(finding({
        message: `${PRIVACY} does not state the ${minutes}-minute response-cache lifetime`,
        file: PRIVACY,
        evidence: `${minutes} minutes`,
      }))
    }
    if (!/app exits/i.test(privacy)) {
      findings.push(finding({
        message: `${PRIVACY} does not state that the response cache ends when the app exits`,
        file: PRIVACY,
      }))
    }
  }

  const i18nSource = ctx.readText(I18N_CONFIG)
  if (i18nSource === null) {
    findings.push(finding({ message: `${I18N_CONFIG} is missing`, file: I18N_CONFIG }))
    return
  }
  const key = readUiLanguageKey(i18nSource)
  if (key === null) {
    findings.push(finding({
      message: `could not read the interface-language storage key from ${I18N_CONFIG}`,
      file: I18N_CONFIG,
    }))
    return
  }
  if (!privacy.includes(key)) {
    findings.push(finding({
      message: `${PRIVACY} does not disclose the ${key} value the app persists`,
      file: PRIVACY,
      evidence: key,
    }))
  }
}

/**
 * The supported-version policy.
 *
 * Every published asset disagrees with the current assertion set, so calling
 * one "supported" promises a fix for a binary nothing here can vouch for. The
 * policy has to take a position, and the position cannot be that a published
 * release is supported.
 */
function checkSupportedVersions(ctx, findings) {
  const security = ctx.readText(SECURITY)
  if (security === null) {
    // Governance owns whether the document exists.
    return
  }

  if (!/supported version/i.test(security)) {
    findings.push(finding({
      message: `${SECURITY} states no supported-version position, so what is supported is left to the reader`,
      file: SECURITY,
    }))
    return
  }

  for (const line of security.split('\n')) {
    if (/published release[^.]{0,40}\bis supported\b/i.test(line) && !/\bno\b/i.test(line)) {
      findings.push(finding({
        message: `${SECURITY} calls a published release supported, but every published asset is historical and unverified`,
        file: SECURITY,
        evidence: line.trim(),
      }))
    }
  }
}

export const docsTruthfulnessRule = {
  id: 'docs-truthfulness',
  title: 'Every README and contribution-guide claim matches the code it describes',
  check(ctx) {
    const findings = []

    const readme = ctx.readText(README)
    if (readme === null) {
      findings.push(finding({ message: `${README} is missing`, file: README }))
      return findings
    }

    const store = ctx.readText(SETTINGS_STORE)
    if (store === null) {
      findings.push(finding({ message: `${SETTINGS_STORE} is missing`, file: SETTINGS_STORE }))
    } else {
      for (const [field, label] of [['correctionModel', 'correction'], ['translationModel', 'translation']]) {
        const value = readModelDefault(store, field)
        if (value === null) {
          findings.push(finding({
            message: `could not read the ${label} model default from ${SETTINGS_STORE}`,
            file: SETTINGS_STORE,
          }))
          continue
        }
        if (!readme.includes(value)) {
          findings.push(finding({
            message: `${README} does not name the ${label} model default the runtime actually uses`,
            file: README,
            evidence: `${field} = ${value}`,
          }))
        }
      }
    }

    if (/qwen3/.test(readme)) {
      findings.push(finding({
        message: `${README} still names a qwen3 model, which the runtime does not default to`,
        file: README,
        evidence: readme.match(/qwen3[^\s`,)]*/)?.[0] ?? 'qwen3',
      }))
    }

    // The exact floor is cross-checked by release-identity; this rule only
    // requires the README to state one at all, so the finding is not duplicated.
    if (!/\*\*macOS\*\*\s*\d+(?:\.\d+)?\+/.test(readme)) {
      findings.push(finding({
        message: `${README} states no macOS minimum version`,
        file: README,
      }))
    }

    for (const artifact of FORBIDDEN_ARTIFACTS) {
      if (readme.includes(artifact)) {
        findings.push(finding({
          message: `${README} promises a ${artifact} artifact, which no workflow builds and no release contains`,
          file: README,
          evidence: artifact,
        }))
      }
    }

    // The docs side of the tag-trigger removal. The workflow file itself is
    // asserted by the action-pins rule, which owns that change; checking it
    // here as well would report the same defect twice.
    if (/on a `?v\*`? tag|tag push triggers|triggered by a `?v\*`? tag/i.test(readme)) {
      findings.push(finding({
        message: `${README} describes a v* tag packaging trigger that no longer exists`,
        file: README,
      }))
    }

    const manifest = ctx.readJson(PACKAGE_MANIFEST)
    const scripts = manifest.ok ? manifest.value.scripts ?? {} : {}
    const contributing = ctx.readText(CONTRIBUTING)

    // A documented command that does not exist is the most common doc rot.
    for (const [file, text] of [[README, readme], [CONTRIBUTING, contributing]]) {
      if (text === null) continue
      for (const name of namedNpmScripts(text)) {
        if (!(name in scripts)) {
          findings.push(finding({
            message: `${file} documents "npm run ${name}", which package.json does not define`,
            file,
            evidence: name,
          }))
        }
      }
    }

    // The complement: a gate that exists but is undocumented is how a
    // contributor submits a PR failing a check nobody told them to run.
    for (const [file, text] of [[README, readme], [CONTRIBUTING, contributing]]) {
      if (text === null) {
        findings.push(finding({ message: `${CONTRIBUTING} is missing`, file: CONTRIBUTING }))
        continue
      }
      for (const gate of DOCUMENTED_GATES) {
        // A plain substring check would let "npm run lint:workflows" satisfy
        // the "npm run lint" gate, so the script name must end where the gate
        // name ends.
        const boundary = new RegExp(`${gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9:_-])`)
        if (!boundary.test(text)) {
          findings.push(finding({
            message: `${file} does not name the ${gate} gate`,
            file,
            evidence: gate,
          }))
        }
      }
    }

    // The runner is the single authority for running a gate group, so both
    // documents have to name it. A document that only lists the individual
    // commands is telling a contributor to run a second copy of the manifest.
    for (const [file, text] of [[README, readme], [CONTRIBUTING, contributing]]) {
      if (text === null) continue
      for (const group of GATE_GROUPS) {
        const command = gateRunnerCommand(group)
        if (!text.includes(command)) {
          findings.push(finding({
            message: `${file} does not name "${command}", which is the only authority for running that gate group`,
            file,
            evidence: command,
          }))
        }
      }
    }

    // A link to the releases page is a download invitation unless the page's
    // assets are classified, and they are historical and non-distributable.
    if (/\/releases\b/.test(readme)) {
      if (!/\bhistorical\b/i.test(readme)) {
        findings.push(finding({
          message: `${README} links the releases page without classifying the assets as historical`,
          file: README,
        }))
      }
      if (!/not\W{0,2}distributable/i.test(readme)) {
        findings.push(finding({
          message: `${README} links the releases page without saying the assets are not distributable`,
          file: README,
        }))
      }
    }

    checkPrivacyDisclosures(ctx, findings)
    checkSupportedVersions(ctx, findings)

    for (const file of [README, ...listDocsFiles(ctx.root)]) {
      const text = ctx.readText(file)
      if (text === null) continue
      for (const line of text.split('\n')) {
        for (const pattern of FORBIDDEN_CLAIMS) {
          if (pattern.test(line) && !NEGATED_CONTEXT.test(line)) {
            findings.push(finding({
              message: `${file} claims a signing or distribution property this project does not have`,
              file,
              evidence: line.trim(),
            }))
          }
        }
        for (const pattern of FORBIDDEN_PACKAGING_CLAIMS) {
          if (pattern.test(line) && !NEGATED_CONTEXT.test(line)) {
            findings.push(finding({
              message: `${file} claims a packaging or rollback property this project does not have`,
              file,
              evidence: line.trim(),
            }))
          }
        }
      }
    }

    return findings
  },
}
