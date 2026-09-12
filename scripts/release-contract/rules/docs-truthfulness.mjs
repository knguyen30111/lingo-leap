import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'
import {
  GATE_GROUPS,
  gateRunnerCommand,
  documentedNpmGateCommands,
} from '../lib/gate-contract.mjs'
import {
  MIN_APP_PAYLOAD_BYTES,
  MIN_DMG_BYTES,
  EXPECTED_EXECUTABLE,
} from '../../verify-package.mjs'

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
const RELEASE_DOC = 'docs/release.md'
const PACKAGING_WORKFLOW = '.github/workflows/package-macos.yml'
const GITIGNORE = '.gitignore'

// The two surfaces that together decide what a gate is. Neither is the sole
// authority: the contract module declares the required list, the manifest is
// what the runner executes, and the gate-manifest rule asserts they are the
// same list. A document that names only one of them tells a contributor to
// change half of a two-key agreement.
const GATE_CONTRACT_MODULE = 'scripts/release-contract/lib/gate-contract.mjs'
const GATES_MANIFEST = 'scripts/gates.json'

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
// `verify-package` does not compute checksums and nothing launches or
// terminates the app; it asserts a minimum artifact size but never a maximum,
// so a ceiling is still a claim this project cannot make. GitHub has no
// primitive that revokes a published asset, and no workflow builds the Linux
// image.
const FORBIDDEN_PACKAGING_CLAIMS = [
  /\bDocker workflow\b/i,
  /\brevoke the (affected )?release\b/i,
  /\b(maximum|max) (artifact |bundle |DMG )?size\b/i,
  /\bsize (cap|ceiling|limit)\b/i,
  /(workflow|verifier) launches and terminates/i,
  /\b(verifier|verification) (also )?(asserts?|checks?|computes?)[^.]{0,40}checksum/i,
]

// A launch claim, wherever it is made. The workflow builds, signs, and runs the
// verifier; no step starts the app, so a status line saying it launches
// describes a run the reader cannot have had.
//
// The second pattern stops at every mark that ends a sentence, so a sentence
// that attributes a hand-run launch to something other than an assertion is not
// swept up by the verb in its first clause: the verb and the launch have to
// stand in the same sentence for one to be a claim about the other. The
// clause-by-clause denial check below narrows it further.
const FORBIDDEN_LAUNCH_CLAIMS = [
  /\b(and|or) launches\b/i,
  /\b(verif(?:y|ies|ied)|assert(?:s|ed)?|prove[sd]?|confirm(?:s|ed)?)\b[^.;!?]{0,60}\blaunch(?:es|ed)?\b/i,
]

// Sole-authority wording about gates. The required list and the manifest the
// runner executes are two files that must agree, so calling either one of them
// the only place a gate is read or changed sends a contributor to half of it.
//
// The last pattern is the same claim in the other direction: the contract
// module and the manifest deliberately carry the gate list twice, and the
// release contract asserts the two agree, so saying nothing keeps a second copy
// describes a repository this is not. What has no second copy is the *running*
// of a group, which every surface delegates to the runner.
const FORBIDDEN_SOLE_GATE_AUTHORITY = [
  /\b(only|single|sole)\b[^.]{0,40}\bauthority\b/i,
  /\bthe (only|single|sole) place to (read|change|edit|update)\b/i,
  /\bnothing\b[^.]{0,40}\b(keeps?|holds?|has|carries)\b[^.]{0,30}\bsecond copy\b/i,
]

// Sweeping claims about a published asset. The historical bundle does satisfy
// some assertions — it is arm64 and its executable is where the verifier looks
// — so "fails every assertion" is false in the project's own favour and hides
// which assertions actually fail.
const FORBIDDEN_SWEEPING_ASSET_CLAIMS = [
  /\bevery (current )?assertion\b/i,
  /\bfails every\b/i,
  /\bdisagrees with every\b/i,
]

// The two floors, each with the wording that identifies its artifact. The
// figures are rendered from the verifier's constants, so changing a constant
// changes what a document has to say.
const SIZE_FLOORS = [
  [MIN_APP_PAYLOAD_BYTES, '.app payload', String.raw`\.app\b`],
  [MIN_DMG_BYTES, 'DMG', String.raw`\bDMG\b`],
]

// The wording that makes a figure a minimum rather than a measurement. Without
// it, prose that merely records how large the last build was satisfies a check
// that only looks for the number.
const FLOOR_WORDING = String.raw`(?:at least|a minimum of|minimum|floors?|no (?:smaller|less) than)`

// Anything that would put the figure and the artifact in different claims. A
// gap that may not cross another artifact name or another size stops a document
// that promises the payload the DMG's floor from satisfying both checks at once.
const FLOOR_GAP = String.raw`(?:(?!\bMiB\b|\.app\b|\bDMG\b)[^.]){0,80}`

// Where the floor wording itself starts inside a match, which is one of the two
// places the floor phrase can begin.
const FLOOR_WORDING_PATTERN = new RegExp(String.raw`\b${FLOOR_WORDING}\b`, 'i')

// Wording that turns a stated minimum into a denial that one exists.
//
// What decides is whether the negation governs the floor, not whether the claim
// contains one anywhere. A negation governs when it stands immediately in front
// of the floor wording, with nothing between them but the determiner and the
// existence verb English puts there: "does not have a minimum of 4 MiB", "is
// exempt from a minimum", "fails to have a minimum", "has no minimum". A
// negation anywhere else qualifies the floor instead of removing it — "at least
// 4 MiB, and anything smaller is not allowed, and the DMG is at least 2 MiB"
// states two floors and denies neither.
//
// Position is also why "requires" is absent from the markers: "requires a
// minimum" asserts the floor, and "does not require a minimum" is caught by the
// negation standing in front of it.
const FLOOR_DENIAL_MARKER = String.raw`(?:\b(?:not|never|no|without|lacks?|lacking|absent|cannot|exempt|fails?|failed|failing)\b|n['\u2019]t)`
const FLOOR_DENIAL_BRIDGE = String.raw`(?:\s+(?:to|of|from|for|a|an|the|any|its|their|be|been|is|are|was|were|have|has|had|hold|holds|held|carry|carries|carried|state|states|stated|assert|asserts|asserted|require|requires|required|set|sets|define|defines|defined|impose|imposes|imposed|enforce|enforces|enforced|specify|specifies|specified|declare|declares|declared|document|documents|documented)){0,4}[\s,]*$`
const FLOOR_GOVERNED_DENIAL = new RegExp(FLOOR_DENIAL_MARKER + FLOOR_DENIAL_BRIDGE, 'i')

// A denial in subject position governs its whole claim however far the floor
// wording sits from it: "nothing gives the payload a minimum of 4 MiB" and
// "neither artifact has a minimum" both say the floor is absent. A claim that
// states a floor positively puts its contrast behind a separator instead.
const FLOOR_SUBJECT_DENIAL = /\b(?:nothing|none|no one|nobody|neither|nor)\b/i

function deniesFloor(before) {
  return FLOOR_SUBJECT_DENIAL.test(before) || FLOOR_GOVERNED_DENIAL.test(before)
}

/**
 * Whether the floor a match `[start, end)` states is denied rather than stated.
 *
 * What a denial governs is the floor phrase — the figure together with the
 * wording that makes it a minimum — and a document writes the two in either
 * order. "does not have a minimum of 4 MiB" puts the denial in front of the
 * wording; "no 4 MiB floor" and "lacks a 4 MiB minimum" put it in front of the
 * figure, and the figure is as much part of the phrase as the wording is. So
 * the phrase begins at whichever of the two the document wrote first, and what
 * governs it is the stretch of the claim in front of that point.
 */
function floorIsDenied(text, start, end, sizePattern) {
  const matched = text.slice(start, end)
  const offsets = [matched.search(FLOOR_WORDING_PATTERN), matched.search(sizePattern)]
    .filter(offset => offset !== -1)
  const phraseAt = start + (offsets.length === 0 ? 0 : Math.min(...offsets))
  return deniesFloor(claimPrefix(text, start, end, phraseAt))
}

// A size denial. These are not subject to the negation exemption below, because
// the denial IS the negated form and the verifier now asserts both floors.
const FORBIDDEN_SIZE_DENIALS = [
  /\b(nothing|no assertion|neither)\b[^.]{0,80}\b(asserts?|checks?|enforces?)\b[^.]{0,30}\bsize\b/i,
  /\bno\b[^.]{0,30}\bsize\b[^.]{0,40}\b(assertion|assert(s|ed)?|check(s|ed)?)\b/i,
]

// Editing a release body and opening an advisory are the first step of the
// rollback procedure, so a sentence that calls editing a published release
// forbidden contradicts the procedure two sections above it. Replacing an
// asset's bytes and moving a tag are the operations that stay forbidden.
const FORBIDDEN_ROLLBACK_CONTRADICTIONS = [
  /\bediting a (published )?release\b[^.]{0,120}\b(forbid|not allowed|must not|never)/i,
  /\b(forbid|never|must not)\w*\b[^.]{0,80}\bedit(ing)? (the|a) release (body|notes|metadata)\b/i,
]

// "Developer ID" and "notarization" are legitimate when the sentence says they
// do NOT exist yet. A line is only a finding when it makes the claim.
//
// The markers are deliberately narrow: a word like "before" or "when" appears
// happily in an affirmative overclaim ("the DMG is notarized before release"),
// so treating it as a denial would hide exactly what this list exists to catch.
//
// The contracted form is the same denial written the way English usually writes
// it. "isn't notarized" and "doesn't launch" deny as plainly as the spelled-out
// words above, and reading only the spelled-out ones reported a true sentence as
// an overclaim.
const NEGATED_CONTEXT =
  /\b(not|no|never|neither|nor|without|once|until|future|would|planned|requires?|lacks?|absent|cannot)\b|n['\u2019]t\b/i

/** The first non-empty line under a document's title, or null. */
export function readmeSummary(markdown) {
  const lines = markdown.split('\n')
  const title = lines.findIndex(line => /^#\s/.test(line))
  if (title === -1) return null
  return lines.slice(title + 1).find(line => line.trim() !== '') ?? null
}

/**
 * The body of the section whose heading matches `heading`, up to the next
 * heading of any level, or null when there is no such section.
 */
export function documentSection(markdown, heading) {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => heading.test(line))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => /^#{1,6}\s/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** A byte count as the mebibyte figure a document states. */
export function mebibytes(bytes) {
  const value = bytes / (1024 * 1024)
  return `${Number.isInteger(value) ? value : value.toFixed(1)} MiB`
}

// The delimiters Markdown wraps a run of text in: a code span, emphasis, and
// bold in either of its spellings. A formatted figure is the same figure, and
// the delimiter opening the run stands between a denial and the figure it
// denies, so the delimiter is read as part of the figure on both sides of it
// rather than as part of what governs the floor.
const MARKDOWN_DELIMITER = String.raw`(?:\*{1,2}|_{1,2}|\x60)`

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether `text` states `figure` as a floor for the artifact `artifactSource`
 * matches, in either of the two orders a document naturally writes it: the
 * artifact first ("the .app payload must be at least 4 MiB") or the figure
 * first ("a 4 MiB floor for the .app payload").
 *
 * The gap between the two may not cross another artifact name or another size,
 * so the figure belonging to the other artifact cannot stand in for this one.
 *
 * Every occurrence is read, and each is accepted only when nothing in front of
 * its floor phrase, inside the claim carrying it, denies that the floor is
 * there. Reading only what precedes the phrase is also what leaves the "no" of
 * "no smaller than" alone: that word belongs to the floor, not to a denial of
 * it.
 */
export function statesFloor(text, artifactSource, figure) {
  const size =
    String.raw`${MARKDOWN_DELIMITER}?${escapeRegExp(figure)}${MARKDOWN_DELIMITER}?`
  const sizePattern = new RegExp(size, 'i')
  const artifactFirst = new RegExp(
    `${artifactSource}${FLOOR_GAP}\\b${FLOOR_WORDING}\\b${FLOOR_GAP}${size}`, 'i')
  const figureFirst = new RegExp(
    `${size}${FLOOR_GAP}\\b${FLOOR_WORDING}\\b${FLOOR_GAP}${artifactSource}`, 'i')
  for (const pattern of [artifactFirst, figureFirst]) {
    for (const [start, end] of matchRanges(pattern, text)) {
      if (!floorIsDenied(text, start, end, sizePattern)) return true
    }
  }
  return false
}

/**
 * Directory entries `.gitignore` excludes, as plain path prefixes. Globs and
 * file entries are skipped: a prefix is what a citation can be tested against.
 */
export function ignoredDirectories(gitignoreText) {
  return gitignoreText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .filter(line => line.endsWith('/') && !/[*?![\]]/.test(line))
    .map(line => line.replace(/^\//, ''))
}

// Where one claim stops governing the next: the end of a sentence, a semicolon
// or colon that introduces a new statement, a dash that interrupts one, and the
// conjunctions English uses to contrast. A denial reaches across the commas of a
// list — "not notarized, stapled, or Developer ID signed" denies all three — so
// commas are deliberately not separators, because that is how an enumeration
// under one denial is written.
//
// A sentence ends at an exclamation or a question mark as readily as at a full
// stop, so all three end a claim. Each separates only when something follows it,
// which keeps `.app`, `release.md`, and `1.1.0` inside the claim they belong to.
const CLAIM_SEPARATOR =
  /[.;:!?](?=\s|$)|[\u2014\u2013]|\b(?:but|while|although|though|however|yet|whereas)\b/gi

/**
 * The segments of a line, as `[start, end)` offsets into it: the stretches
 * between the separators above, each of which carries its own denial or none.
 */
export function claimSegments(line) {
  const segments = []
  let start = 0
  for (const match of line.matchAll(CLAIM_SEPARATOR)) {
    segments.push([start, match.index])
    start = match.index + match[0].length
  }
  segments.push([start, line.length])
  return segments
}

/**
 * The text of every segment a match spanning `[start, end)` touches, which is
 * where a denial has to stand for that match to be excused. A claim may straddle
 * a separator, so the segments it touches are joined rather than the match being
 * attributed to one of them.
 */
export function claimContext(line, start, end) {
  return claimPrefix(line, start, end, line.length)
}

/**
 * The same claim, clipped at `upto`: what stands in front of a given point
 * inside it.
 *
 * Some negations only deny when they come first. A floor is removed by a
 * negation written before the floor wording and merely restated by one written
 * after it, so the check needs the front of the claim rather than all of it.
 */
export function claimPrefix(line, start, end, upto) {
  return claimSegments(line)
    .filter(([from, to]) => from < end && to > start)
    .map(([from, to]) => line.slice(from, Math.max(from, Math.min(to, upto))))
    .filter(part => part !== '')
    .join(' ')
}

/**
 * Every place `pattern` matches `text`, as `[start, end)` offsets.
 *
 * All of them matter: a denied claim earlier in a line must not hide an
 * affirmative one written after it, and reading only the first match is what
 * let "the bundle is not notarized; the DMG is notarized" through. The global
 * copy is built here rather than kept on the pattern, so no `lastIndex` from
 * one line survives into the next.
 */
export function matchRanges(pattern, text) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return [...text.matchAll(new RegExp(pattern.source, flags))]
    .map(match => [match.index, match.index + match[0].length])
}

/**
 * Whether `line` makes the claim `pattern` describes without denying it.
 *
 * Each claim is read twice. Once inside the single segment that carries it,
 * which is where its own denial has to stand — that is what catches a claim
 * written after a denial of the opposite. And once against the whole line, so a
 * claim that straddles a separator is still caught, excused only by a denial in
 * the segments it actually touches.
 */
export function claimsWithoutDenial(pattern, line) {
  for (const [from, to] of claimSegments(line)) {
    const segment = line.slice(from, to)
    if (matchRanges(pattern, segment).length > 0 && !NEGATED_CONTEXT.test(segment)) return true
  }
  return matchRanges(pattern, line)
    .some(([start, end]) => !NEGATED_CONTEXT.test(claimContext(line, start, end)))
}

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

/**
 * The summary line under the README title.
 *
 * It is the first claim anybody reads, so it cannot present the app as
 * distributed: nothing is published, and the platform is one the app is built
 * and verified for.
 */
function checkReadmeSummary(readme, findings) {
  const summary = readmeSummary(readme)
  if (summary === null) {
    findings.push(finding({ message: `${README} has no summary line under its title`, file: README }))
    return
  }
  if (/\bdistributed for\b/i.test(summary)) {
    findings.push(finding({
      message: `${README} presents the app as distributed, but no binary is published`,
      file: README,
      evidence: summary.trim(),
    }))
  }
  if (!/built and verified/i.test(summary)) {
    findings.push(finding({
      message: `${README} does not say the platform is one the app is built and verified for`,
      file: README,
      evidence: summary.trim(),
    }))
  }
}

/**
 * The gate surfaces a document has to name, and the sole-authority wording it
 * may not use. Both files have to be findable from the document, because
 * changing a gate means changing both of them deliberately.
 */
function checkGateAuthority(ctx, findings) {
  for (const file of [README, CONTRIBUTING, RELEASE_DOC]) {
    const text = ctx.readText(file)
    // Absence is owned elsewhere: governance for the release document, the
    // checks above for the other two.
    if (text === null) continue

    for (const [surface, why] of [
      [GATE_CONTRACT_MODULE, 'which is where the required gates are declared'],
      [GATES_MANIFEST, 'which is the manifest the runner executes'],
    ]) {
      if (!text.includes(surface)) {
        findings.push(finding({
          message: `${file} does not name ${surface}, ${why}`,
          file,
          evidence: surface,
        }))
      }
    }

    for (const line of text.split('\n')) {
      for (const pattern of FORBIDDEN_SOLE_GATE_AUTHORITY) {
        if (pattern.test(line)) {
          findings.push(finding({
            message: `${file} calls one surface the sole gate authority, but ${GATE_CONTRACT_MODULE} and ${GATES_MANIFEST} have to agree`,
            file,
            evidence: line.trim(),
          }))
        }
      }
    }
  }
}

/**
 * The artifact-size floors, read from the verifier so a changed constant makes
 * the documents follow.
 *
 * Each figure has to be attached to its own artifact and stated as a minimum.
 * Looking for the numbers alone would accept a document that swaps them, and
 * would accept measurement prose left behind after the floor itself was deleted.
 */
function checkSizeFloors(ctx, findings) {
  for (const file of [README, RELEASE_DOC]) {
    const text = ctx.readText(file)
    if (text === null) continue
    for (const [bytes, label, artifact] of SIZE_FLOORS) {
      const figure = mebibytes(bytes)
      if (!statesFloor(text, artifact, figure)) {
        findings.push(finding({
          message: `${file} does not state the ${figure} ${label} floor the verifier asserts`,
          file,
          evidence: figure,
        }))
      }
    }
  }
}

/**
 * Paths a document sends a reader to that the repository does not carry.
 *
 * Working notes and build output are excluded by `.gitignore`, so a citation
 * under one of those directories is a reference nobody who clones the
 * repository can open. The directories are read from `.gitignore` rather than
 * listed here, so excluding a new one makes this follow.
 */
function checkCitedPaths(ctx, findings, files) {
  const gitignore = ctx.readText(GITIGNORE)
  if (gitignore === null) return

  for (const directory of ignoredDirectories(gitignore)) {
    const escaped = escapeRegExp(directory)
    // Where a path can start: at the beginning of one, not in the middle of a
    // longer path and not at the tail of a URL, though a relative `./` or `../`
    // does introduce one. Without this, `build/dist/index.html` was read as a
    // citation of the excluded `dist/`, and an upstream URL ending in the same
    // name was one too.
    const opens = String.raw`(?:(?<=\.{1,2}/)|(?<![A-Za-z0-9._/-]))`
    // A file beneath the directory, and the directory itself wherever a document
    // points at it as a path rather than naming it in prose. The trailing slash
    // is what separates those two cases — the README's `node_modules`
    // build-cache sentence names a directory without sending anybody to one —
    // and the slash reads the same in prose, in a code span, in an inline
    // destination with or without angle brackets, and in a reference definition,
    // so one pattern covers every syntax a document uses.
    const underneath = new RegExp(`${opens}${escaped}[A-Za-z0-9._/-]+`, 'g')
    const bare = new RegExp(`${opens}${escaped}(?![A-Za-z0-9._/-])`)

    for (const file of files) {
      const text = ctx.readText(file)
      if (text === null) continue
      const cited = new Set(text.match(underneath) ?? [])
      if (bare.test(text)) cited.add(directory)
      for (const match of cited) {
        findings.push(finding({
          message: `${file} cites ${match}, which ${GITIGNORE} excludes, so a reader of the repository cannot open it`,
          file,
          evidence: match,
        }))
      }
    }
  }
}

/**
 * A shell block a document publishes, which a reader copies and runs whole.
 *
 * Two things make such a block a false instruction. It can expand a variable
 * nothing in it defines, in which case the command measures whatever the
 * reader's shell happened to hold — nothing, usually. And it can define its own
 * inputs without `set -euo pipefail`, in which case a failed discovery step
 * still exits 0 and prints an empty line, which reads like a measurement.
 *
 * Names the block cannot define are exempt: they come from the environment the
 * reader already has.
 */
const SHELL_FENCE = /^```(?:sh|bash|zsh)\n([\s\S]*?)^```/gm
const SHELL_ENVIRONMENT = new Set(['HOME', 'PATH', 'PWD', 'SHELL', 'TMPDIR', 'USER', 'LANG', 'CI'])
const FAIL_FAST = 'set -euo pipefail'

export function shellBlocks(markdown) {
  return [...markdown.matchAll(SHELL_FENCE)].map(match => match[1])
}

/** The variable names a block assigns, from an assignment or a loop. */
export function shellDefinitions(block) {
  const names = new Set()
  for (const pattern of [
    /^\s*(?:export |local |readonly |typeset )?([A-Za-z_][A-Za-z0-9_]*)=/gm,
    /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g,
    /\bread\s+(?:-r\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/g,
  ]) {
    for (const match of block.matchAll(pattern)) names.add(match[1])
  }
  return names
}

/** The variable names a block expands, positional parameters excluded. */
export function shellExpansions(block) {
  return new Set([...block.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g)].map(match => match[1]))
}

function checkShellBlocks(ctx, findings, files) {
  for (const file of files) {
    const text = ctx.readText(file)
    if (text === null) continue
    for (const block of shellBlocks(text)) {
      const defined = shellDefinitions(block)
      const expanded = shellExpansions(block)
      for (const name of expanded) {
        if (defined.has(name) || SHELL_ENVIRONMENT.has(name)) continue
        findings.push(finding({
          message: `${file} documents a shell block that expands $${name} without defining it, so the command a reader copies measures nothing`,
          file,
          evidence: `$${name}`,
        }))
      }
      // A block that both defines and uses its own inputs is a script, and a
      // script that does not stop at the first failure reports success for a
      // measurement it never took.
      const isScript = [...expanded].some(name => defined.has(name))
      if (isScript && !block.includes(FAIL_FAST)) {
        findings.push(finding({
          message: `${file} documents a shell block that defines and expands variables without \`${FAIL_FAST}\`, so a failed step still reports success`,
          file,
          evidence: FAIL_FAST,
        }))
      }
    }
  }
}

/**
 * The historical published asset, described by what it actually fails.
 *
 * It satisfies the architecture and executable-path assertions, so a document
 * that says it fails everything is wrong in the project's own favour and tells
 * a reader nothing about which assertions matter.
 */
function checkHistoricalAssets(ctx, findings) {
  const release = ctx.readText(RELEASE_DOC)
  if (release === null) return

  const section = documentSection(release, /^#{2,4}\s+Historical published assets\b/i)
  if (section === null) {
    findings.push(finding({
      message: `${RELEASE_DOC} has no historical published assets section, so the published bundle is unclassified`,
      file: RELEASE_DOC,
    }))
    return
  }
  if (!/\barm64\b/i.test(section)) {
    findings.push(finding({
      message: `${RELEASE_DOC} does not record that the published asset is arm64, which is one of the assertions it satisfies`,
      file: RELEASE_DOC,
    }))
  }
  const executablePath = `Contents/MacOS/${EXPECTED_EXECUTABLE}`
  if (!section.includes(executablePath)) {
    findings.push(finding({
      message: `${RELEASE_DOC} does not record that the published asset carries its executable at ${executablePath}`,
      file: RELEASE_DOC,
      evidence: executablePath,
    }))
  }
}

/**
 * The rollback procedure.
 *
 * Recording the problem in the release body and opening an advisory are
 * permitted safety operations, and so is withdrawing availability by drafting
 * the release or deleting an affected asset. Moving a tag and replacing an
 * asset in place are the operations that destroy the record, so the document
 * has to forbid exactly those.
 */
function checkRollback(ctx, findings) {
  const release = ctx.readText(RELEASE_DOC)
  if (release === null) return

  const section = documentSection(release, /^##\s+Rollback\b/i)
  if (section === null) {
    findings.push(finding({
      message: `${RELEASE_DOC} has no rollback section`,
      file: RELEASE_DOC,
    }))
    return
  }

  const required = [
    [/\bdraft\b/i, 'does not name converting the release back to a draft, which is the withdrawal the platform actually offers'],
    [/\badvisor/i, 'does not name the advisory that records the problem before availability is removed'],
    [/\brelease body\b/i, 'does not name the release body the problem is recorded in first'],
    [
      /(never|not)\b[^.]{0,80}\bmov(e|ing)\b[^.]{0,40}\btag\b|\btag\b[^.]{0,60}(never|not)\b[^.]{0,40}\bmov/i,
      'does not forbid moving the tag, which is what would destroy the record of what was published',
    ],
    [
      /(never|not|no)\b[^.]{0,80}\breplac\w*\b[^.]{0,60}\basset\b|\basset\b[^.]{0,60}(never|not)\b[^.]{0,40}\breplac/i,
      'does not forbid replacing a published asset in place',
    ],
  ]
  for (const [pattern, why] of required) {
    if (!pattern.test(section)) {
      findings.push(finding({ message: `${RELEASE_DOC} ${why}`, file: RELEASE_DOC }))
    }
  }

  // The contradiction is a wrapped sentence in practice, so the whole document
  // is read as one line for this check alone.
  const joined = release.split('\n').join(' ')
  for (const pattern of FORBIDDEN_ROLLBACK_CONTRADICTIONS) {
    const match = joined.match(pattern)
    if (match) {
      findings.push(finding({
        message: `${RELEASE_DOC} treats editing a published release as forbidden, but recording the problem in the release body is the first rollback step`,
        file: RELEASE_DOC,
        evidence: match[0].trim(),
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

    checkReadmeSummary(readme, findings)
    checkPrivacyDisclosures(ctx, findings)
    checkSupportedVersions(ctx, findings)
    checkGateAuthority(ctx, findings)
    checkSizeFloors(ctx, findings)
    checkHistoricalAssets(ctx, findings)
    checkRollback(ctx, findings)
    checkCitedPaths(ctx, findings, [README, CONTRIBUTING, ...listDocsFiles(ctx.root)])
    checkShellBlocks(ctx, findings, [README, CONTRIBUTING, ...listDocsFiles(ctx.root)])

    // The packaging workflow's echoed status text is read exactly like a
    // document: it is prose a reader trusts about the run in front of them, and
    // a YAML `run:` block is the one place nothing else would check it.
    for (const file of [README, PACKAGING_WORKFLOW, ...listDocsFiles(ctx.root)]) {
      const text = ctx.readText(file)
      if (text === null) continue
      for (const line of text.split('\n')) {
        for (const [patterns, message] of [
          [FORBIDDEN_CLAIMS, 'claims a signing or distribution property this project does not have'],
          [FORBIDDEN_PACKAGING_CLAIMS, 'claims a packaging or rollback property this project does not have'],
          [FORBIDDEN_LAUNCH_CLAIMS, 'claims the bundle is launched, which no gate and no workflow step does'],
          [FORBIDDEN_SWEEPING_ASSET_CLAIMS, 'claims a published asset fails every assertion, instead of naming the ones it fails'],
        ]) {
          for (const pattern of patterns) {
            // Every occurrence is read, and each against the claim that carries
            // it: a line that denies something and then asserts it makes the
            // assertion, whichever of the two a reader meets first.
            if (claimsWithoutDenial(pattern, line)) {
              findings.push(finding({ message: `${file} ${message}`, file, evidence: line.trim() }))
            }
          }
        }
        // Not exempted by the negation above: a denial that no size is asserted
        // is itself the false claim now that both floors exist.
        for (const pattern of FORBIDDEN_SIZE_DENIALS) {
          if (pattern.test(line)) {
            findings.push(finding({
              message: `${file} says no assertion checks an artifact size, but the verifier asserts a minimum for the .app payload and the DMG`,
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
