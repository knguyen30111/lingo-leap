// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { docsTruthfulnessRule, readModelDefault, namedNpmScripts } from './docs-truthfulness.mjs'
import { GATE_GROUPS, gateRunnerCommand, documentedNpmGateCommands } from '../lib/gate-contract.mjs'

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

const GOOD_README = [
  '# Lingo Leap',
  '',
  '- **macOS** 14.0+ on Apple silicon',
  '- Models: `aya:8b` for translation, `qwen2.5:7b` for correction',
  '',
  '## Quality gates',
  '',
  ...RUNNERS.map(r => `- \`${r}\``),
  ...GATES.map(g => `- \`${g}\``),
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
  write('.github/workflows/package-macos.yml', overrides.workflow ?? 'on:\n  workflow_dispatch:\n')
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

describe('docs-truthfulness: the gate runner is the only authority', () => {
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
    ['sizes the verifier never checks', 'It asserts artifact names and sizes.'],
    ['a launch the workflow never performs', 'The workflow launches and terminates the app.'],
    ['a size limit nothing enforces', 'Artifact size enforcement happens in the workflow.'],
    ['checksums the verifier does not compute', 'The verifier asserts the SHA-256 checksum.'],
  ])('reports %s', (_label, line) => {
    seed({ readme: `${GOOD_README}\n${line}\n` })

    expect(messages()).toContain('claims a packaging or rollback property this project does not have')
  })

  it.each([
    'There is no Docker workflow: nothing builds that image.',
    'GitHub offers no primitive that revokes a published asset.',
    'Nothing anywhere asserts an artifact size.',
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
