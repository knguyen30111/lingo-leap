// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { docsTruthfulnessRule, readModelDefault, namedNpmScripts } from './docs-truthfulness.mjs'

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

const GATES = [
  'npm run lint',
  'npm run lint:workflows',
  'npm run typecheck',
  'npm run verify:release-contract',
  'npm run build',
  'npm run test:coverage',
]

const GOOD_README = [
  '# Lingo Leap',
  '',
  '- **macOS** 14.0+ on Apple silicon',
  '- Models: `aya:8b` for translation, `qwen2.5:7b` for correction',
  '',
  '## Quality gates',
  '',
  ...GATES.map(g => `- \`${g}\``),
  '',
  'Packaging is manual dispatch only and is not for distribution.',
  '',
].join('\n')

const GOOD_CONTRIBUTING = ['# Contributing', '', ...GATES.map(g => `- \`${g}\``), ''].join('\n')

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

  it('reports a workflow that still triggers on a v* tag', () => {
    seed({ workflow: "on:\n  workflow_dispatch:\n  push:\n    tags:\n      - 'v*'\n" })

    expect(messages()).toContain('still triggers on a v* tag')
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
