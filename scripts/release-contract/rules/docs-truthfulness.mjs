import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'

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

const FORBIDDEN_ARTIFACTS = ['.deb', '.rpm', '.AppImage']

// The full gate list a contributor has to be able to find.
const DOCUMENTED_GATES = [
  'npm run lint',
  'npm run lint:workflows',
  'npm run typecheck',
  'npm run verify:release-contract',
  'npm run build',
  'npm run test:coverage',
]

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
      }
    }

    return findings
  },
}
