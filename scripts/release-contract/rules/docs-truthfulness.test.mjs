// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import {
  docsTruthfulnessRule,
  readModelDefault,
  namedNpmScripts,
  readmeSummary,
  documentSection,
  mebibytes,
  ignoredDirectories,
  statesFloor,
} from './docs-truthfulness.mjs'
import { GATE_GROUPS, gateRunnerCommand, documentedNpmGateCommands } from '../lib/gate-contract.mjs'
import { MIN_APP_PAYLOAD_BYTES, MIN_DMG_BYTES, EXPECTED_EXECUTABLE } from '../../verify-package.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-truthfulness-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
}

const GATES = documentedNpmGateCommands()

const RUNNERS = GATE_GROUPS.map(gateRunnerCommand)

// The two surfaces that together define a gate, named the way the documents
// have to name them.
const GATE_AUTHORITY_LINE =
  'The required gates live in `scripts/release-contract/lib/gate-contract.mjs`; '
  + '`scripts/gates.json` is the manifest the runner executes, and the two must agree.'

// The floors are read from the verifier, so a changed constant changes what the
// documents have to say.
const SIZE_FLOOR_LINE =
  `The verifier asserts a ${mebibytes(MIN_APP_PAYLOAD_BYTES)} floor for the .app payload `
  + `and a ${mebibytes(MIN_DMG_BYTES)} floor for the DMG.`

const GOOD_SUMMARY =
  'Local-AI translation app. Built and verified for **macOS on Apple silicon (arm64)**. '
  + 'There is no distributable download.'

const GOOD_README = [
  '# Lingo Leap',
  '',
  GOOD_SUMMARY,
  '',
  '- **macOS** 14.0+ on Apple silicon',
  '- Models: `aya:8b` for translation, `qwen2.5:7b` for correction',
  '',
  '## Quality gates',
  '',
  ...RUNNERS.map(r => `- \`${r}\``),
  ...GATES.map(g => `- \`${g}\``),
  '',
  GATE_AUTHORITY_LINE,
  '',
  SIZE_FLOOR_LINE,
  '',
  'Packaging is manual dispatch only and is not for distribution.',
  '',
].join('\n')

const GOOD_CONTRIBUTING = [
  '# Contributing',
  '',
  ...RUNNERS.map(r => `- \`${r}\``),
  ...GATES.map(g => `- \`${g}\``),
  '',
  GATE_AUTHORITY_LINE,
  '',
].join('\n')

// A release document carrying every claim the rule requires of it: the gate
// surfaces, the size floors, a historical-asset section precise about what the
// published bundle actually is, and a rollback that separates a permitted
// metadata edit from a forbidden byte replacement.
const GOOD_RELEASE = [
  '# Release',
  '',
  GATE_AUTHORITY_LINE,
  '',
  SIZE_FLOOR_LINE,
  '',
  '### Historical published assets',
  '',
  'The published bundle is arm64 and carries its executable at the expected',
  `\`Contents/MacOS/${EXPECTED_EXECUTABLE}\` path. It fails the version, minimum-system-version,`,
  'Hardened Runtime, entitlement, and strict-verification assertions.',
  '',
  '## Rollback',
  '',
  '1. Record the problem at the top of the release body and open an advisory.',
  '2. Convert the release back to a draft, or delete the affected assets.',
  '3. Keep the tag: do not delete the tag and do not move it.',
  '',
  'Never replace a published asset in place and never move a tag.',
  '',
].join('\n')

const GOOD_SECURITY = [
  '# Security Policy',
  '',
  '## Supported versions',
  '',
  'No published release is supported. The assets on the Releases page are historical.',
  '',
].join('\n')

const CACHE_SOURCE = 'const aiResultCache = new LRUCache<string>(100, 30)\n'

const I18N_SOURCE = [
  "      lookupLocalStorage: 'tran-app-ui-language',",
  "  localStorage.setItem('tran-app-ui-language', lng);",
  '',
].join('\n')

const GOOD_PRIVACY = [
  '# Privacy',
  '',
  '| Data | Where | Lifetime |',
  '|---|---|---|',
  '| Settings | local storage, key `tran-app-settings` | until cleared |',
  '| Interface language | local storage, key `tran-app-ui-language` | until cleared |',
  '| Response cache | memory only | up to **30 minutes**, or until the app exits |',
  '',
].join('\n')

// The repository excludes its working notes, so a document that points a reader
// at a file under one of these directories is citing something a clone does not
// carry.
const GITIGNORE = [
  '# Dependencies',
  'node_modules/',
  '',
  '# Build outputs',
  'dist/',
  'coverage/',
  '',
  '# Working notes',
  'plans/',
  '',
].join('\n')

const STORE = [
  'export const useSettingsStore = create(',
  '  persist(',
  '    (set) => ({',
  '      translationModel: "aya:8b",',
  '      correctionModel: "qwen2.5:7b",',
  '    })',
  '  )',
  ')',
  '',
].join('\n')

// The packaging workflow's own echoed status text is prose a reader trusts, so
// it is checked exactly like a document.
const GOOD_WORKFLOW = [
  'on:',
  '  workflow_dispatch:',
  'jobs:',
  '  bundle:',
  '    steps:',
  '      - name: Artifact status',
  '        run: |',
  '          echo "These artifacts are ad-hoc signed with the Hardened Runtime in force."',
  '          echo "They are NOT notarized and are NOT for distribution."',
  '          echo "They exist only to verify that the bundle builds, signs, and passes the package verifier."',
  '',
].join('\n')

function seed(overrides = {}) {
  write('README.md', overrides.readme ?? GOOD_README)
  write('CONTRIBUTING.md', overrides.contributing ?? GOOD_CONTRIBUTING)
  write('src/stores/settingsStore.ts', overrides.store ?? STORE)
  write('package.json', {
    scripts: overrides.scripts ?? {
      lint: 'eslint src scripts --max-warnings 0',
      'lint:workflows': 'bash scripts/lint-workflows.sh',
      typecheck: 'tsc --noEmit',
      'verify:release-contract': 'node scripts/release-contract/cli.mjs',
      build: 'vite build',
      'test:coverage': 'vitest run --coverage',
    },
  })
  write('src/lib/cache.ts', overrides.cache ?? CACHE_SOURCE)
  write('src/i18n/config.ts', overrides.i18n ?? I18N_SOURCE)
  write('SECURITY.md', overrides.security ?? GOOD_SECURITY)
  write('.github/workflows/package-macos.yml', overrides.workflow ?? GOOD_WORKFLOW)
  write('.gitignore', overrides.gitignore ?? GITIGNORE)
  if (overrides.docs) {
    for (const [name, body] of Object.entries(overrides.docs)) write(`docs/${name}`, body)
  }
}

function run() {
  return docsTruthfulnessRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(e => e.message).join('\n')
}

describe('docs-truthfulness rule', () => {
  it('reports nothing when the README matches the code', () => {
    seed()

    expect(run()).toEqual([])
  })

  // Reading the default from the store is what makes a runtime change force a
  // documentation change.
  it('reports a README that names a stale correction model', () => {
    seed({ readme: GOOD_README.replace('qwen2.5:7b', 'qwen2.5:3b') })

    expect(messages()).toContain('does not name the correction model default the runtime actually uses')
  })

  it('reports a README that names a stale translation model', () => {
    seed({ readme: GOOD_README.replace('aya:8b', 'aya:35b') })

    expect(messages()).toContain('does not name the translation model default the runtime actually uses')
  })

  it('follows the store when the runtime default changes', () => {
    seed({ store: STORE.replace('qwen2.5:7b', 'llama3.1:8b') })

    expect(messages()).toContain('does not name the correction model default')
  })

  it('reports any lingering qwen3 mention', () => {
    seed({ readme: `${GOOD_README}\nAlso try qwen3:4b.\n` })

    expect(messages()).toContain('still names a qwen3 model')
  })

  it('reports a README that states no macOS minimum', () => {
    seed({ readme: GOOD_README.replace('- **macOS** 14.0+ on Apple silicon', '- macOS') })

    expect(messages()).toContain('states no macOS minimum version')
  })

  it.each(['.deb', '.rpm', '.AppImage'])('reports a promised %s artifact', artifact => {
    seed({ readme: `${GOOD_README}\nDownload the ${artifact} build.\n` })

    expect(messages()).toContain(`promises a ${artifact} artifact`)
  })

  it('reports a README describing a v* tag trigger', () => {
    seed({ readme: `${GOOD_README}\nPackaging runs on a \`v*\` tag.\n` })

    expect(messages()).toContain('describes a v* tag packaging trigger')
  })

  // The most common form of doc rot.
  it('reports a documented script that package.json does not define', () => {
    seed({ readme: `${GOOD_README}\nRun \`npm run test:e2e\` first.\n` })

    expect(messages()).toContain('documents "npm run test:e2e", which package.json does not define')
  })

  it('reports a documented script in CONTRIBUTING.md too', () => {
    seed({ contributing: `${GOOD_CONTRIBUTING}\n- \`npm run nope\`\n` })

    expect(messages()).toContain('CONTRIBUTING.md documents "npm run nope"')
  })

  // The complement: an undocumented gate is how a contributor fails a check
  // nobody told them to run.
  it.each(GATES)('reports %s missing from the README', gate => {
    seed({ readme: GOOD_README.replace(`- \`${gate}\`\n`, '') })

    expect(messages()).toContain(`README.md does not name the ${gate} gate`)
  })

  it('reports a gate missing from CONTRIBUTING.md', () => {
    seed({ contributing: GOOD_CONTRIBUTING.replace('- `npm run typecheck`\n', '') })

    expect(messages()).toContain('CONTRIBUTING.md does not name the npm run typecheck gate')
  })

  it('reports a missing CONTRIBUTING.md', () => {
    seed()
    fs.rmSync(path.join(fixture, 'CONTRIBUTING.md'))

    expect(messages()).toContain('CONTRIBUTING.md is missing')
  })

  it.each([
    'The DMG is notarized before release.',
    'Each build is stapled for Gatekeeper.',
    'Signed with a Developer ID certificate.',
    'The bundle is Gatekeeper-approved.',
    'The artifact is ready for distribution.',
  ])('reports the overclaim: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a signing or distribution property this project does not have')
  })

  // The same words are legitimate when the sentence denies them.
  it.each([
    'The bundle is not notarized and carries no secure timestamp.',
    'Notarization requires a Developer ID, which this environment does not have.',
    'A future Developer ID build would add notarization on top of the Hardened Runtime.',
    'These bundles are never stapled, because no notarization step exists.',
  ])('does not fire on the negated statement: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
  })

  it('sweeps files under docs/ as well as the README', () => {
    seed({ docs: { 'release.md': '# Release\nThe DMG is notarized before release.\n' } })

    expect(messages()).toContain('docs/release.md claims a signing or distribution property')
  })
})

describe('docs-truthfulness helpers', () => {
  it('reads a model default out of the store source', () => {
    expect(readModelDefault(STORE, 'correctionModel')).toBe('qwen2.5:7b')
  })

  it('returns null for a field the store does not define', () => {
    expect(readModelDefault(STORE, 'nosuchModel')).toBeNull()
  })

  it('collects each npm script named in prose once', () => {
    expect(namedNpmScripts('run `npm run lint` then `npm run lint` then `npm run build`'))
      .toEqual(['lint', 'build'])
  })
})

describe('docs-truthfulness: the gate surfaces a document has to name', () => {
  it.each(GATE_GROUPS)('reports a README that never names the %s runner invocation', group => {
    seed({ readme: GOOD_README.replace(`\`${gateRunnerCommand(group)}\``, '`run the gates`') })

    expect(messages()).toContain(`README.md does not name "${gateRunnerCommand(group)}"`)
  })

  it.each(GATE_GROUPS)('reports a CONTRIBUTING that never names the %s runner invocation', group => {
    seed({
      contributing: GOOD_CONTRIBUTING.replace(`\`${gateRunnerCommand(group)}\``, '`run the gates`'),
    })

    expect(messages()).toContain(`CONTRIBUTING.md does not name "${gateRunnerCommand(group)}"`)
  })

  // The gate names the documents have to carry are derived from the contract,
  // so adding a required gate makes the documentation check follow by itself.
  it('requires exactly the npm gates the contract derives', () => {
    expect(documentedNpmGateCommands()).toContain('npm run typecheck')
    seed({ readme: GOOD_README.replace('`npm run typecheck`', '') })

    expect(messages()).toContain('README.md does not name the npm run typecheck gate')
  })
})

describe('docs-truthfulness: the overclaims this issue removed', () => {
  it.each([
    ['a Docker workflow that does not exist', 'The Docker workflow builds the toolchain.'],
    ['a revoke primitive GitHub does not have', 'Revoke the affected release.'],
    ['a size ceiling nothing asserts', 'The verifier enforces a maximum artifact size.'],
    ['a launch the workflow never performs', 'The workflow launches and terminates the app.'],
    ['a distribution size cap that does not exist', 'A size cap keeps the DMG downloadable.'],
    ['checksums the verifier does not compute', 'The verifier asserts the SHA-256 checksum.'],
  ])('reports %s', (_label, line) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a packaging or rollback property this project does not have')
  })

  it.each([
    'There is no Docker workflow: nothing builds that image.',
    'GitHub offers no primitive that revokes a published asset.',
    'No upper bound on artifact size is asserted anywhere.',
    'Neither the workflow nor the verifier launches or terminates the app.',
  ])('leaves the denial "%s" alone', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a packaging or rollback property')
  })

  it('checks docs files as well as the README', () => {
    seed({ docs: { 'release.md': 'Revoke the affected release.\n' } })

    expect(messages()).toContain('claims a packaging or rollback property this project does not have')
  })
})

describe('docs-truthfulness: the privacy disclosures the code forces', () => {
  it('reports nothing when the privacy note matches the code', () => {
    seed({ docs: { 'privacy.md': GOOD_PRIVACY } })

    expect(run()).toEqual([])
  })

  it('reports a privacy note that never names the interface-language storage key', () => {
    seed({ docs: { 'privacy.md': GOOD_PRIVACY.replace(/tran-app-ui-language/g, 'somewhere') } })

    expect(messages()).toContain(
      'docs/privacy.md does not disclose the tran-app-ui-language value the app persists'
    )
  })

  it('reports a privacy note that states the wrong cache lifetime', () => {
    seed({ docs: { 'privacy.md': GOOD_PRIVACY.replace('30 minutes', '5 minutes') } })

    expect(messages()).toContain('docs/privacy.md does not state the 30-minute response-cache lifetime')
  })

  it('reports a privacy note that never says the cache dies with the app', () => {
    seed({ docs: { 'privacy.md': GOOD_PRIVACY.replace(', or until the app exits', '') } })

    expect(messages()).toContain('docs/privacy.md does not state that the response cache ends when the app exits')
  })

  it('reports a cache module whose lifetime cannot be read', () => {
    seed({ cache: 'const aiResultCache = new LRUCache<string>()\n', docs: { 'privacy.md': GOOD_PRIVACY } })

    expect(messages()).toContain('could not read the response-cache lifetime from src/lib/cache.ts')
  })

  it('reports an i18n module whose storage key cannot be read', () => {
    seed({ i18n: 'const detection = {}\n', docs: { 'privacy.md': GOOD_PRIVACY } })

    expect(messages()).toContain('could not read the interface-language storage key from src/i18n/config.ts')
  })

  it('says nothing about privacy when the document is absent, which governance owns', () => {
    seed()

    expect(messages()).not.toContain('privacy')
  })
})

describe('docs-truthfulness: how published assets are classified', () => {
  const withReleases = extra => [
    GOOD_README,
    'Get it from [Releases](https://github.com/knguyen30111/lingo-leap/releases).',
    extra,
    '',
  ].join('\n')

  it('accepts a release link that classifies the assets', () => {
    seed({ readme: withReleases('They are **historical and unverified** and **not distributable**.') })

    expect(run()).toEqual([])
  })

  it('reports a release link with no classification at all', () => {
    seed({ readme: withReleases('Download the DMG.') })

    expect(messages()).toContain('README.md links the releases page without classifying the assets as historical')
  })

  it('reports a release link that never says the assets are not distributable', () => {
    seed({ readme: withReleases('They are **historical**.') })

    expect(messages()).toContain('README.md links the releases page without saying the assets are not distributable')
  })
})

describe('docs-truthfulness: the supported-version policy', () => {
  it('accepts a policy that supports no published release', () => {
    seed()

    expect(run()).toEqual([])
  })

  // The published asset disagrees with every current assertion, so calling it
  // supported would promise a fix for something nothing here can vouch for.
  it.each([
    'Only the newest published release is supported.',
    'The newest published release is supported on a best-effort basis.',
    'A published release is supported until the next one ships.',
  ])('reports "%s"', line => {
    seed({ security: `# Security Policy\n\n## Supported versions\n\n${line}\n` })

    expect(messages()).toContain('SECURITY.md calls a published release supported')
  })

  it('reports a security policy that states no supported-version position at all', () => {
    seed({ security: '# Security Policy\n\nReport bugs.\n' })

    expect(messages()).toContain('SECURITY.md states no supported-version position')
  })
})

describe('docs-truthfulness: the summary line under the README title', () => {
  it('accepts a summary that says the platform is built and verified for', () => {
    seed()

    expect(run()).toEqual([])
  })

  // The exact wording this removed: the app is not distributed for anything.
  it('reports a summary that presents the app as distributed', () => {
    const summary = 'Local-AI translation app. Distributed for **macOS on Apple silicon (arm64)**.'
    seed({ readme: GOOD_README.replace(GOOD_SUMMARY, summary) })

    expect(messages()).toContain('README.md presents the app as distributed')
  })

  it('reports a summary that claims neither building nor verification', () => {
    seed({ readme: GOOD_README.replace(GOOD_SUMMARY, 'Local-AI translation app for macOS.') })

    expect(messages()).toContain('README.md does not say the platform is one the app is built and verified for')
  })

  it('reads the summary as the first non-empty line under the title', () => {
    expect(readmeSummary('# Title\n\nFirst line.\n\nSecond line.\n')).toBe('First line.')
  })

  it('reads no summary from a document with no title', () => {
    expect(readmeSummary('just prose\n')).toBeNull()
  })
})

describe('docs-truthfulness: what the packaging workflow echoes', () => {
  it('accepts a status step that claims only building, signing, and verification', () => {
    seed()

    expect(run()).toEqual([])
  })

  // The exact line the workflow used to print. Nothing in the workflow launches
  // the bundle, so the claim was untrue of the run a reader was looking at.
  it('reports the workflow claiming the bundle launches', () => {
    const workflow = GOOD_WORKFLOW.replace(
      'builds, signs, and passes the package verifier.',
      'builds, signs, and launches.'
    )
    seed({ workflow })

    expect(messages()).toContain('.github/workflows/package-macos.yml claims the bundle is launched')
  })

  it('reports the workflow claiming a launch is verified', () => {
    const workflow = GOOD_WORKFLOW.replace(
      'echo "These artifacts are ad-hoc signed with the Hardened Runtime in force."',
      'echo "Each artifact is asserted to launch cleanly."'
    )
    seed({ workflow })

    expect(messages()).toContain('.github/workflows/package-macos.yml claims the bundle is launched')
  })

  it('reports a signing overclaim echoed by the workflow', () => {
    const workflow = GOOD_WORKFLOW.replace(
      'echo "They are NOT notarized and are NOT for distribution."',
      'echo "They are notarized and ready for distribution."'
    )
    seed({ workflow })

    expect(messages()).toContain('.github/workflows/package-macos.yml claims a signing or distribution property')
  })

  it('leaves a document denial of the launch claim alone', () => {
    seed({ readme: `${GOOD_README}\nNeither the workflow nor the verifier launches or terminates the app.\n` })

    expect(messages()).not.toContain('claims the bundle is launched')
  })

  it('leaves a hand-run launch recorded as local evidence alone', () => {
    const line = 'A launch and termination was run by hand and recorded; no gate asserts it.'
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims the bundle is launched')
  })
})

describe('docs-truthfulness: the gate contract and the gate manifest', () => {
  it.each([
    ['README.md', readme => ({ readme })],
    ['CONTRIBUTING.md', contributing => ({ contributing })],
  ])('reports %s calling one surface the sole gate authority', (file, build) => {
    const base = file === 'README.md' ? GOOD_README : GOOD_CONTRIBUTING
    const claimed = `${base}\nThat runner is the **only** authority for running a gate group.\n`
    seed(build(claimed))

    expect(messages()).toContain(`${file} calls one surface the sole gate authority`)
  })

  it('reports a document calling the manifest the only place to change a gate', () => {
    seed({ contributing: `${GOOD_CONTRIBUTING}\nThe manifest is the only place to change a gate.\n` })

    expect(messages()).toContain('CONTRIBUTING.md calls one surface the sole gate authority')
  })

  it.each(['README.md', 'CONTRIBUTING.md'])('reports %s that never names the gate contract module', file => {
    const base = file === 'README.md' ? GOOD_README : GOOD_CONTRIBUTING
    const stripped = base.replace('`scripts/release-contract/lib/gate-contract.mjs`', 'somewhere')
    seed(file === 'README.md' ? { readme: stripped } : { contributing: stripped })

    expect(messages()).toContain(
      `${file} does not name scripts/release-contract/lib/gate-contract.mjs, which is where the required gates are declared`
    )
  })

  it.each(['README.md', 'CONTRIBUTING.md'])('reports %s that never names the gate manifest', file => {
    const base = file === 'README.md' ? GOOD_README : GOOD_CONTRIBUTING
    const stripped = base.replace('`scripts/gates.json`', 'a manifest')
    seed(file === 'README.md' ? { readme: stripped } : { contributing: stripped })

    expect(messages()).toContain(
      `${file} does not name scripts/gates.json, which is the manifest the runner executes`
    )
  })

  it('requires the release document to name both surfaces as well', () => {
    const stripped = GOOD_RELEASE.replace('`scripts/gates.json`', 'a manifest')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not name scripts/gates.json')
  })
})

describe('docs-truthfulness: the artifact size floors the verifier asserts', () => {
  it.each(['README.md', 'docs/release.md'])('reports %s denying that any size is asserted', file => {
    const line = 'Nothing anywhere asserts an artifact size.'
    seed(file === 'README.md'
      ? { readme: `${GOOD_README}\n${line}\n` }
      : { docs: { 'release.md': `${GOOD_RELEASE}\n${line}\n` } })

    expect(messages()).toContain(`${file} says no assertion checks an artifact size`)
  })

  it('reports a README that states neither size floor', () => {
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, 'The verifier checks the bundle.') })

    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_APP_PAYLOAD_BYTES)} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_DMG_BYTES)} DMG floor`)
  })

  it('reports a release document that states neither size floor', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE.replace(SIZE_FLOOR_LINE, 'The verifier checks the bundle.') } })

    expect(messages()).toContain('docs/release.md does not state the')
  })

  it('renders a byte count as mebibytes', () => {
    expect(mebibytes(4 * 1024 * 1024)).toBe('4 MiB')
    expect(mebibytes(2 * 1024 * 1024)).toBe('2 MiB')
  })
})

describe('docs-truthfulness: how precisely a published asset is described', () => {
  it('accepts a release document that names which assertions the asset fails', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE } })

    expect(run()).toEqual([])
  })

  it.each([
    'So the published asset disagrees with every current assertion that has since been written down.',
    'It disagrees with every assertion the current path makes.',
    'The published bundle fails every assertion in the verifier.',
  ])('reports the sweeping claim: %s', line => {
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\n${line}\n` } })

    expect(messages()).toContain('docs/release.md claims a published asset fails every assertion')
  })

  it('reports the same sweeping claim in the README', () => {
    seed({ readme: `${GOOD_README}\nIt disagrees with every assertion the current path makes.\n` })

    expect(messages()).toContain('README.md claims a published asset fails every assertion')
  })

  // The asset does satisfy two assertions, so the description has to say so.
  it('reports a historical-asset section that never says the asset is arm64', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE.replace('is arm64 and', 'is something and') } })

    expect(messages()).toContain('docs/release.md does not record that the published asset is arm64')
  })

  it('reports a historical-asset section that never names the expected executable path', () => {
    const stripped = GOOD_RELEASE.replace(`\`Contents/MacOS/${EXPECTED_EXECUTABLE}\` path`, 'right place')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain(
      `docs/release.md does not record that the published asset carries its executable at Contents/MacOS/${EXPECTED_EXECUTABLE}`
    )
  })

  it('reports a release document with no historical-asset section at all', () => {
    const stripped = GOOD_RELEASE.replace('### Historical published assets', '### Other notes')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md has no historical published assets section')
  })

  it('reads a section up to the next heading', () => {
    const doc = '# T\n\n## One\n\nalpha\n\n## Two\n\nbeta\n'

    expect(documentSection(doc, /^##\s+One\b/i)).toContain('alpha')
    expect(documentSection(doc, /^##\s+One\b/i)).not.toContain('beta')
    expect(documentSection(doc, /^##\s+Missing\b/i)).toBeNull()
  })
})

describe('docs-truthfulness: what a rollback may and may not do', () => {
  it('accepts a rollback that separates a metadata edit from a byte replacement', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE } })

    expect(run()).toEqual([])
  })

  // The contradiction: the rollback procedure starts by editing the release
  // body, so a later sentence cannot call editing a release forbidden. The
  // claim is wrapped across lines in the real document, so the scan joins them.
  it('reports a document that forbids the release-body edit its own rollback requires', () => {
    const contradiction = [
      GOOD_RELEASE,
      'The discontinuity is accepted rather than repaired, because editing a published release or',
      'replacing a published asset would mutate an immutable public artifact — which the rollback',
      'rule above forbids outright.',
      '',
    ].join('\n')
    seed({ docs: { 'release.md': contradiction } })

    expect(messages()).toContain('docs/release.md treats editing a published release as forbidden')
  })

  it('reports a document that forbids recording the problem in the release body', () => {
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\nNever edit the release body of a published release.\n` } })

    expect(messages()).toContain('docs/release.md treats editing a published release as forbidden')
  })

  it('reports a rollback that never names the draft withdrawal', () => {
    const stripped = GOOD_RELEASE.replace('Convert the release back to a draft, or delete', 'Remove')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not name converting the release back to a draft')
  })

  it('reports a rollback that never names the advisory', () => {
    const stripped = GOOD_RELEASE.replace(' and open an advisory', '')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not name the advisory')
  })

  it('reports a rollback that never names the release body', () => {
    const stripped = GOOD_RELEASE.replace('at the top of the release body', 'somewhere')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not name the release body')
  })

  it('reports a rollback that does not forbid moving the tag', () => {
    const stripped = GOOD_RELEASE
      .replace('3. Keep the tag: do not delete the tag and do not move it.', '3. Keep the tag.')
      .replace('Never replace a published asset in place and never move a tag.',
        'Never replace a published asset in place.')
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not forbid moving the tag')
  })

  it('reports a rollback that does not forbid replacing a published asset', () => {
    const stripped = GOOD_RELEASE.replace(
      'Never replace a published asset in place and never move a tag.',
      'Never move a tag.'
    )
    seed({ docs: { 'release.md': stripped } })

    expect(messages()).toContain('docs/release.md does not forbid replacing a published asset in place')
  })

  it('reports a release document with no rollback section', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE.replace('## Rollback', '## Notes') } })

    expect(messages()).toContain('docs/release.md has no rollback section')
  })
})

describe('docs-truthfulness: which artifact each size floor belongs to', () => {
  // Searching for the two figures anywhere in the document cannot tell the
  // right claim from its opposite: a document that promises the .app payload
  // the DMG's floor and the DMG the payload's floor contains both figures.
  const SWAPPED =
    `The verifier asserts a ${mebibytes(MIN_DMG_BYTES)} floor for the .app payload `
    + `and a ${mebibytes(MIN_APP_PAYLOAD_BYTES)} floor for the DMG.`

  it('reports a README that swaps the two floors', () => {
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, SWAPPED) })

    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_APP_PAYLOAD_BYTES)} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_DMG_BYTES)} DMG floor`)
  })

  it('reports a release document that swaps the two floors', () => {
    seed({ docs: { 'release.md': GOOD_RELEASE.replace(SIZE_FLOOR_LINE, SWAPPED) } })

    expect(messages()).toContain(`docs/release.md does not state the ${mebibytes(MIN_APP_PAYLOAD_BYTES)} .app payload floor`)
  })

  // Prose that merely measures an artifact carries both figures too, so a
  // document that drops the floor entirely still reads as compliant unless the
  // check requires the minimum wording.
  it('reports a document that states the figures only as measurements', () => {
    const measured =
      `The last build produced a ${mebibytes(MIN_APP_PAYLOAD_BYTES)} .app payload `
      + `and a ${mebibytes(MIN_DMG_BYTES)} DMG.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, measured) })

    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_APP_PAYLOAD_BYTES)} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${mebibytes(MIN_DMG_BYTES)} DMG floor`)
  })

  it('accepts the floor stated artifact first', () => {
    const artifactFirst =
      `The .app payload must be at least **${mebibytes(MIN_APP_PAYLOAD_BYTES)}** `
      + `and the DMG at least **${mebibytes(MIN_DMG_BYTES)}**.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, artifactFirst) })

    expect(messages()).not.toContain('does not state the')
  })

  it('accepts a floor whose wording wraps across lines', () => {
    const wrapped =
      `The verifier asserts a minimum size for each artifact: the .app payload must be\n`
      + `at least **${mebibytes(MIN_APP_PAYLOAD_BYTES)}** and the DMG at least **${mebibytes(MIN_DMG_BYTES)}**.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, wrapped) })

    expect(messages()).not.toContain('does not state the')
  })
})

describe('docs-truthfulness: a denial covers the claim that carries it', () => {
  // The bypass this exists to close: one true denial at the head of a line
  // exempted every other claim written after it.
  const MIXED = 'They are NOT notarized, but the verifier confirms the app launches.'

  it('reports the overclaim in a line whose denial belongs to another claim', () => {
    seed({ readme: `${GOOD_README}\n${MIXED}\n` })

    expect(messages()).toContain('README.md claims the bundle is launched')
  })

  it('still honours the denial in that same line', () => {
    seed({ readme: `${GOOD_README}\n${MIXED}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
  })

  it('reports the overclaim when the workflow echoes the same mixed line', () => {
    const workflow = GOOD_WORKFLOW.replace(
      'echo "They are NOT notarized and are NOT for distribution."',
      `echo "${MIXED}"`
    )
    seed({ workflow })

    expect(messages()).toContain('.github/workflows/package-macos.yml claims the bundle is launched')
  })

  it.each([
    ['a semicolon', 'No Developer ID exists here; the DMG is notarized before release.'],
    ['a contrast', 'Nothing is stapled, but the artifact is ready for distribution.'],
    ['a concession', 'No credentials exist, though the bundle is Gatekeeper-approved.'],
  ])('reports an overclaim joined to a denial by %s', (_label, line) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a signing or distribution property this project does not have')
  })

  // A denial does reach across the commas of a list, which is how the real
  // documents write one.
  it.each([
    'There is no Developer ID, so the bundle is never stapled.',
    'Notarization requires a Developer ID, which this environment does not have.',
    'These bundles are never stapled, because no notarization step exists.',
    'The bundle is not notarized, carries no secure timestamp, and is not for distribution.',
    'A future Developer ID signature would add identity, a timestamp, and notarization.',
  ])('leaves the denial "%s" governing its whole claim', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
  })

  // A claim can span a separator, and splitting the line must not let it slip
  // between the pieces.
  it('reports an overclaim that spans a separator', () => {
    seed({ readme: `${GOOD_README}\nThe run verifies that the bundle, after signing, launches cleanly.\n` })

    expect(messages()).toContain('README.md claims the bundle is launched')
  })
})

describe('docs-truthfulness: documents cite only paths the repository carries', () => {
  it.each(['README.md', 'CONTRIBUTING.md'])('reports %s citing an excluded evidence path', file => {
    const line = 'The measurements are recorded under `plans/reports/`.'
    const base = file === 'README.md' ? GOOD_README : GOOD_CONTRIBUTING
    seed(file === 'README.md' ? { readme: `${base}\n${line}\n` } : { contributing: `${base}\n${line}\n` })

    expect(messages()).toContain(`${file} cites plans/reports/`)
  })

  it('reports a release document citing an excluded evidence file', () => {
    const line = 'The raw output is in `plans/reports/published-asset.txt`.'
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\n${line}\n` } })

    expect(messages()).toContain('docs/release.md cites plans/reports/published-asset.txt')
  })

  // Which directories are unavailable is read from .gitignore, so excluding a
  // new directory makes the check follow instead of going stale.
  it('follows .gitignore rather than naming one directory', () => {
    seed({ readme: `${GOOD_README}\nSee \`coverage/index.html\` for the numbers.\n` })

    expect(messages()).toContain('README.md cites coverage/index.html')
  })

  it('leaves a citation alone once the directory is no longer excluded', () => {
    seed({
      readme: `${GOOD_README}\nSee \`coverage/index.html\` for the numbers.\n`,
      gitignore: GITIGNORE.replace('coverage/\n', ''),
    })

    expect(messages()).not.toContain('cites coverage/index.html')
  })

  it('leaves a bare directory name in prose alone', () => {
    seed({ readme: `${GOOD_README}\nThe image caches \`node_modules\` between runs.\n` })

    expect(messages()).not.toContain('cites node_modules')
  })

  it('reads the excluded directories out of a .gitignore', () => {
    expect(ignoredDirectories('# c\nnode_modules/\ndist/\n.env\n*.log\nbuild/*/\n'))
      .toEqual(['node_modules/', 'dist/'])
  })
})

describe('docs-truthfulness: the gate list is deliberately written down twice', () => {
  // `gate-contract.mjs` and `gates.json` both carry the list on purpose, and the
  // release contract asserts they agree, so claiming nothing keeps a second copy
  // describes a repository this is not.
  it('reports a document claiming nothing keeps a second copy of the gate commands', () => {
    seed({
      docs: {
        'release.md': `${GOOD_RELEASE}\nEvery surface runs a group through that script; nothing keeps a second copy of the commands.\n`,
      },
    })

    expect(messages()).toContain('docs/release.md calls one surface the sole gate authority')
  })

  it('accepts the precise wording about execution surfaces', () => {
    seed({
      docs: {
        'release.md': `${GOOD_RELEASE}\nEvery surface runs a group through that script; no execution surface keeps a second copy of the commands.\n`,
      },
    })

    expect(run()).toEqual([])
  })
})

describe('docs-truthfulness: every occurrence of a claim is read, not just the first', () => {
  // A denial in the first clause and the claim in the second: reading only the
  // first place a pattern matches excuses the whole line, because the match the
  // denial covers is the only one ever examined.
  it.each([
    ['a signing claim after a denial of it', 'The bundle is not notarized; the DMG is notarized before release.',
      'claims a signing or distribution property this project does not have'],
    ['an identity claim after a denial of it', 'No Developer ID exists here; this is a Developer ID signed build.',
      'claims a signing or distribution property this project does not have'],
    ['a launch claim in the sentence after a denial', 'They are NOT notarized. The verifier confirms the app launches.',
      'claims the bundle is launched'],
    ['a distribution claim contradicting its own denial', 'It is not ready for distribution; actually it is ready for distribution.',
      'claims a signing or distribution property this project does not have'],
    ['a launch claim whose verb is denied earlier', 'The verifier does not confirm but later confirms the app launches.',
      'claims the bundle is launched'],
  ])('reports %s', (_label, line, message) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain(message)
  })

  // The denials the real documents write have to keep working: a sentence-level
  // boundary must not cut a denial off from the enumeration it governs.
  it.each([
    'The bundles are not notarized. No Developer ID credentials exist in this environment.',
    'The bundle is not notarized, carries no secure timestamp, and is not for distribution.',
    'There is no Developer ID: the signing identity is ad-hoc, not a team.',
    'Neither the workflow nor the verifier launches or terminates the app.',
    'A future Developer ID signature would add identity, a secure timestamp, and notarization.',
  ])('leaves the denial "%s" alone', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
    expect(messages()).not.toContain('claims the bundle is launched')
  })
})

describe('docs-truthfulness: a size floor has to be asserted, not denied', () => {
  const APP_FIGURE = mebibytes(MIN_APP_PAYLOAD_BYTES)
  const DMG_FIGURE = mebibytes(MIN_DMG_BYTES)

  it('reports a document that denies both floors in minimum wording', () => {
    const denied =
      `The \`.app\` payload does not have a minimum of **${APP_FIGURE}** `
      + `and the DMG does not have a minimum of **${DMG_FIGURE}**.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, denied) })

    expect(messages()).toContain(`README.md does not state the ${APP_FIGURE} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${DMG_FIGURE} DMG floor`)
  })

  it('reports the denied floor while accepting the one still asserted', () => {
    const mixed =
      `The \`.app\` payload has no minimum of **${APP_FIGURE}**. `
      + `The DMG must be at least **${DMG_FIGURE}**.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, mixed) })

    expect(messages()).toContain(`README.md does not state the ${APP_FIGURE} .app payload floor`)
    expect(messages()).not.toContain(`does not state the ${DMG_FIGURE} DMG floor`)
  })

  it('reports a floor whose denial stands earlier in the same wrapped claim', () => {
    const wrapped =
      `Nothing in the verifier gives the \`.app\` payload\na minimum of **${APP_FIGURE}**, `
      + `and the DMG has no minimum of **${DMG_FIGURE}**.`
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, wrapped) })

    expect(messages()).toContain(`README.md does not state the ${APP_FIGURE} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${DMG_FIGURE} DMG floor`)
  })

  // A denial of something else in a neighbouring sentence is not a denial of
  // the floor, which is what keeps the real wording acceptable.
  it('accepts a floor stated beside a denial of an upper bound', () => {
    const stated =
      `The \`.app\` payload is at least **${APP_FIGURE}** and the DMG at least **${DMG_FIGURE}**. `
      + 'No upper bound is asserted, because a ceiling would be a distribution policy this project does not have.'
    seed({ readme: GOOD_README.replace(SIZE_FLOOR_LINE, stated) })

    expect(messages()).not.toContain('does not state the')
  })
})

describe('docs-truthfulness: a documented shell block runs on its own', () => {
  const FAIL_FAST = [
    '```sh',
    'set -euo pipefail',
    '',
    'BUNDLE_ROOT=${1:?usage: measure <bundle-root>}',
    'APP=$(find "$BUNDLE_ROOT/macos" -maxdepth 1 -type d -name \'*.app\')',
    'find "$APP" -type f -exec stat -f \'%z\' {} + | awk \'{ total += $1 } END { print total }\'',
    '```',
  ].join('\n')

  it('reports a block that expands a variable it never defines', () => {
    const block = ['```sh', 'stat -f \'%z\' "$DMG"', '```'].join('\n')
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\n${block}\n` } })

    expect(messages()).toContain('docs/release.md documents a shell block that expands $DMG without defining it')
  })

  it('reports a block that defines and uses variables without failing fast', () => {
    const block = FAIL_FAST.replace('set -euo pipefail\n\n', '')
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\n${block}\n` } })

    expect(messages()).toContain('docs/release.md documents a shell block that defines and expands variables without `set -euo pipefail`')
  })

  it('accepts a self-contained block that fails fast', () => {
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\n${FAIL_FAST}\n` } })

    expect(run()).toEqual([])
  })

  it('accepts a block that expands an environment variable it cannot define', () => {
    const block = ['```bash', 'source $HOME/.cargo/env', '```'].join('\n')
    seed({ readme: `${GOOD_README}\n${block}\n` })

    expect(messages()).not.toContain('shell block')
  })
})

describe('docs-truthfulness: a cited directory is a citation too', () => {
  it('reports a backticked citation of an excluded directory', () => {
    seed({ readme: `${GOOD_README}\nThe evidence is recorded under \`plans/\`.\n` })

    expect(messages()).toContain('README.md cites plans/, which .gitignore excludes')
  })

  it('reports a link whose destination is an excluded directory', () => {
    seed({ docs: { 'release.md': `${GOOD_RELEASE}\nSee [the working notes](plans/).\n` } })

    expect(messages()).toContain('docs/release.md cites plans/, which .gitignore excludes')
  })

  it('leaves an unbackticked directory name in prose alone', () => {
    seed({ readme: `${GOOD_README}\nThe image caches node_modules between runs.\n` })

    expect(messages()).not.toContain('cites node_modules')
  })
})

// The measurement block the release document publishes is run here exactly as a
// reader would run it, because a snippet that cannot be executed is a claim
// nobody can check. `stat -f` is BSD, so the execution is macOS-only; the
// structural requirements above hold everywhere.
describe('docs-truthfulness: the documented measurement block executes', () => {
  const REPO_ROOT = new URL('../../../', import.meta.url).pathname
  const PAYLOAD = ['Contents/MacOS/tran-app', 'Contents/Info.plist', 'Contents/Resources/icon.icns']

  function documentedSnippet() {
    const release = fs.readFileSync(path.join(REPO_ROOT, 'docs/release.md'), 'utf8')
    const blocks = [...release.matchAll(/^```sh\n([\s\S]*?)^```/gm)].map(m => m[1])
    return blocks.find(block => block.includes('stat -f'))
  }

  function bundleRoot({ apps = ['Lingo Leap.app'], dmgs = ['Lingo Leap_1.1.0_aarch64.dmg'] } = {}) {
    const root = path.join(fixture, 'bundle')
    for (const app of apps) {
      for (const [index, relative] of PAYLOAD.entries()) {
        const target = path.join(root, 'macos', app, relative)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, Buffer.alloc(1000 * (index + 1)))
      }
    }
    for (const dmg of dmgs) {
      const target = path.join(root, 'dmg', dmg)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, Buffer.alloc(4096))
    }
    return root
  }

  function measure(args, options = {}) {
    const script = path.join(fixture, 'measure.sh')
    fs.writeFileSync(script, documentedSnippet())
    return spawnSync('zsh', [script, ...args], { encoding: 'utf8', ...options })
  }

  const onMacOS = process.platform === 'darwin' ? it : it.skip

  it('publishes a measurement block', () => {
    expect(documentedSnippet()).toBeDefined()
  })

  onMacOS('prints the payload sum and the DMG size for a single bundle', () => {
    const root = bundleRoot()

    const result = measure([root])

    expect(result.status).toBe(0)
    expect(result.stdout.trim().split('\n')).toEqual(['6000', '4096'])
  })

  onMacOS('fails when no bundle root is given', () => {
    const result = measure([])

    expect(result.status).not.toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  onMacOS('fails when the bundle root does not exist', () => {
    const result = measure([path.join(fixture, 'absent')])

    expect(result.status).not.toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  onMacOS('fails when the bundle root carries two .app bundles', () => {
    const root = bundleRoot({ apps: ['One.app', 'Two.app'] })

    const result = measure([root])

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('.app')
  })

  onMacOS('fails when the bundle root carries no DMG', () => {
    const root = bundleRoot({ dmgs: [] })

    const result = measure([root])

    expect(result.status).not.toBe(0)
    expect(result.stdout.trim()).toBe('')
  })

  onMacOS('fails rather than printing an empty sum for an empty .app', () => {
    const root = bundleRoot()
    fs.rmSync(path.join(root, 'macos', 'Lingo Leap.app', 'Contents'), { recursive: true })

    const result = measure([root])

    expect(result.status).not.toBe(0)
    expect(result.stdout.trim()).toBe('')
  })
})

// A claim stops at the end of the sentence that carries it, and English ends a
// sentence with an exclamation or a question mark as readily as with a full
// stop. A denial in one sentence must not excuse the assertion in the next.
describe('docs-truthfulness: a sentence ends at an exclamation or a question mark too', () => {
  it.each([
    'Is the bundle ever notarized without a Developer ID? The DMG is notarized before release.',
    'The bundle is never stapled! Each build is stapled for Gatekeeper.',
  ])('reports the signing claim made after a denial: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a signing or distribution property this project does not have')
  })

  it.each([
    'The verifier never launches the app! The run verifies the bundle launches cleanly.',
    'Is the app ever launched without a gate? The workflow verifies that it launches.',
  ])('reports the launch claim made after a denial: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims the bundle is launched')
  })

  // The denial still governs the sentence it stands in, whichever mark ends it.
  it.each([
    'The bundle is never notarized! It is never stapled either.',
    'Neither the workflow nor the verifier launches the app! Nothing here starts it.',
  ])('leaves a denial that governs its own sentence alone: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
    expect(messages()).not.toContain('claims the bundle is launched')
  })

  // The verb and the launch have to sit in the same sentence for one to be a
  // claim about the other.
  it('does not read a launch claim across a sentence boundary', () => {
    const line = 'The workflow verifies the signature! A launch was run by hand; no gate asserts it.'
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims the bundle is launched')
  })
})

// English writes a denial as a contraction as often as it writes it out.
describe('docs-truthfulness: a contracted denial denies', () => {
  it.each([
    "The bundle isn't notarized and carries no secure timestamp.",
    "There isn't a Developer ID in this environment.",
    "These builds won't be stapled.",
    "The workflow doesn't verify that the app launches.",
  ])('leaves the contracted denial alone: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('claims a signing or distribution property')
    expect(messages()).not.toContain('claims the bundle is launched')
  })

  // A contraction somewhere in the line is not a licence for the claim beside it.
  it.each([
    "The bundle isn't stapled, but the DMG is notarized before release.",
    "Signing doesn't happen automatically; each build is stapled for Gatekeeper.",
  ])('still reports the affirmative claim beside a contracted denial: %s', line => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a signing or distribution property this project does not have')
  })
})

// Floor vocabulary can be used to say the floor is not there. What decides is
// where the negation stands: in front of the floor it removes it, behind the
// floor it qualifies it, and the "no" of "no smaller than" is the floor itself.
describe('docs-truthfulness: floor vocabulary is not the same as a floor', () => {
  const APP = mebibytes(MIN_APP_PAYLOAD_BYTES)
  const DMG = mebibytes(MIN_DMG_BYTES)

  function readmeStating(line) {
    return GOOD_README.replace(SIZE_FLOOR_LINE, line)
  }

  it.each([
    `The .app payload fails to have a minimum of ${APP} and the DMG fails to have a minimum of ${DMG}.`,
    `The .app payload is exempt from a minimum of ${APP} and the DMG is exempt from a minimum of ${DMG}.`,
    `Nothing gives the .app payload a minimum of ${APP} or the DMG a minimum of ${DMG}.`,
    `The .app payload never had a minimum of ${APP} and the DMG never had a minimum of ${DMG}.`,
    `The .app payload doesn't have a minimum of ${APP} and the DMG doesn't have a minimum of ${DMG}.`,
    `Neither the .app payload has a minimum of ${APP} nor the DMG has a minimum of ${DMG}.`,
  ])('reports floor vocabulary that denies the floor: %s', line => {
    seed({ readme: readmeStating(line) })

    expect(messages()).toContain(`README.md does not state the ${APP} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${DMG} DMG floor`)
  })

  it.each([
    `The .app payload is no smaller than ${APP} and the DMG is no less than ${DMG}.`,
    `The .app payload must be at least ${APP}, and anything smaller is not allowed. `
      + `The DMG must be at least ${DMG}, and anything smaller is not allowed.`,
    `The .app payload has a minimum of ${APP} and the DMG has a minimum of ${DMG}; no maximum is asserted.`,
    `The .app payload requires a minimum of ${APP} and the DMG requires a minimum of ${DMG}.`,
    `The .app payload is at least ${APP}, and anything smaller is not allowed, `
      + `and the DMG is at least ${DMG}, and anything smaller is not allowed.`,
  ])('accepts the floor stated positively: %s', line => {
    seed({ readme: readmeStating(line) })

    expect(messages()).not.toContain(`README.md does not state the ${APP}`)
    expect(messages()).not.toContain(`README.md does not state the ${DMG}`)
  })

  // A document that writes the figure before the wording puts the denial in
  // front of the figure, because the figure and the wording are one phrase and
  // the denial governs the whole of it.
  it.each([
    `There is no ${APP} floor for the .app payload and no ${DMG} floor for the DMG.`,
    `This is not a ${APP} floor for the .app payload and not a ${DMG} floor for the DMG.`,
    `The verifier lacks a ${APP} minimum for the .app payload and lacks a ${DMG} minimum for the DMG.`,
  ])('reports a denial standing in front of the figure: %s', line => {
    seed({ readme: readmeStating(line) })

    expect(messages()).toContain(`README.md does not state the ${APP} .app payload floor`)
    expect(messages()).toContain(`README.md does not state the ${DMG} DMG floor`)
  })

  it.each([
    `The verifier asserts a ${APP} floor for the .app payload and a ${DMG} floor for the DMG.`,
    `The verifier asserts a ${APP} minimum for the .app payload and a ${DMG} minimum for the DMG.`,
    `A ${APP} floor applies to the .app payload and a ${DMG} floor applies to the DMG.`,
  ])('accepts the figure-first floor stated positively: %s', line => {
    seed({ readme: readmeStating(line) })

    expect(messages()).not.toContain(`README.md does not state the ${APP}`)
    expect(messages()).not.toContain(`README.md does not state the ${DMG}`)
  })

  it('reads a denial in front of the figure as a denial of the floor it precedes', () => {
    const artifact = String.raw`\.app\b`

    expect(statesFloor(`There is no ${APP} floor for the .app payload.`, artifact, APP)).toBe(false)
    expect(statesFloor(`This is not a ${APP} floor for the .app payload.`, artifact, APP)).toBe(false)
    expect(statesFloor(`The verifier lacks a ${APP} minimum for the .app payload.`, artifact, APP)).toBe(false)
    expect(statesFloor(`The verifier asserts a ${APP} floor for the .app payload.`, artifact, APP)).toBe(true)
    expect(statesFloor(`The verifier asserts a ${APP} minimum for the .app payload.`, artifact, APP)).toBe(true)
  })

  it('reads a lower-bound phrasing as a floor and a missing minimum as its denial', () => {
    const artifact = String.raw`\.app\b`

    expect(statesFloor(`The .app payload is no smaller than ${APP}.`, artifact, APP)).toBe(true)
    expect(statesFloor(`The .app payload is no less than ${APP}.`, artifact, APP)).toBe(true)
    expect(statesFloor(`The .app payload has no minimum of ${APP}.`, artifact, APP)).toBe(false)
    expect(statesFloor(`The .app payload is exempt from a minimum of ${APP}.`, artifact, APP)).toBe(false)
  })
})

// A trailing slash is what turns a directory name into somewhere a reader is
// being sent, and a document sends a reader there in more than one syntax.
describe('docs-truthfulness: pointing at an excluded directory is a citation in every form', () => {
  it.each([
    ['prose', 'The measurements are recorded under plans/ in the working tree.'],
    ['a code span', 'The measurements are recorded under `plans/`.'],
    ['an inline destination', 'See [the working notes](plans/).'],
    ['an angle-bracketed destination', 'See [the working notes](<plans/>).'],
    ['a relative destination', 'See [the working notes](./plans/).'],
  ])('reports %s pointing at an excluded directory', (_form, line) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('README.md cites plans/, which .gitignore excludes')
  })

  it('reports a reference definition whose destination is an excluded directory', () => {
    seed({ readme: `${GOOD_README}\n[the working notes]: plans/\n` })

    expect(messages()).toContain('README.md cites plans/, which .gitignore excludes')
  })

  it.each([
    ['a directory named in prose without a path', 'The image caches node_modules between runs.'],
    ['a directory named in a code span without a path', 'The image caches `node_modules` between runs.'],
    ['a word that merely begins with the directory name', 'Release plans are tracked in the issue tracker.'],
    ['a URL whose last segment shares the name', 'The upstream notes live at https://example.com/notes/plans/ instead.'],
    ['a path that only contains the directory name', 'The packager writes to `build/dist/index.html` instead.'],
  ])('leaves %s alone', (_form, line) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).not.toContain('which .gitignore excludes')
  })
})
