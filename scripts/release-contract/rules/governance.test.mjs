// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { governanceRule, REQUIRED_DOCUMENTS, relativeLinkTargets } from './governance.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

const LICENSE_TEXT = [
  'MIT License',
  '',
  'Copyright (c) 2026 Lingo Leap contributors',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
  '',
].join('\n')

const SECURITY_TEXT = [
  '# Security Policy',
  '',
  'Use private vulnerability reporting on the repository Security tab when it is available.',
  'If that button is not present, open an issue saying only that you have a security report.',
  'x'.repeat(700),
  '',
].join('\n')

function filler(n = 900) {
  return `${'text '.repeat(Math.ceil(n / 5))}\n`
}

function seed(overrides = {}) {
  write('LICENSE', overrides.license ?? LICENSE_TEXT)
  write('CONTRIBUTING.md', overrides.contributing ?? `# Contributing\n${filler()}`)
  write('CODE_OF_CONDUCT.md', overrides.conduct ?? `# Code of Conduct\n${filler()}`)
  write('SECURITY.md', overrides.security ?? SECURITY_TEXT)
  write('docs/system-architecture.md', overrides.architecture ?? `# Architecture\n${filler()}`)
  write('docs/privacy.md', overrides.privacy ?? `# Privacy\n${filler()}`)
  write('docs/release.md', overrides.release ?? `# Release\n${filler()}`)
  write('README.md', overrides.readme ?? [
    '# Lingo Leap',
    '',
    'See [LICENSE](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md),',
    'and [privacy](docs/privacy.md).',
    '',
  ].join('\n'))
}

function run() {
  return governanceRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(e => e.message).join('\n')
}

describe('governance rule', () => {
  it('reports nothing when every document is present and resolvable', () => {
    seed()

    expect(run()).toEqual([])
  })

  it.each(REQUIRED_DOCUMENTS.map(d => d.file))('reports a missing %s', file => {
    seed()
    fs.rmSync(path.join(fixture, file))

    expect(messages()).toContain(`${file} is missing`)
  })

  // An empty placeholder must fail, not merely an absent file.
  it('reports a document that exists but is an empty placeholder', () => {
    seed({ privacy: '# Privacy\n' })

    expect(messages()).toContain('docs/privacy.md is too short to be a real document')
  })

  it.each([
    'MIT License',
    'Copyright (c) 2026 Lingo Leap contributors',
    'WITHOUT WARRANTY OF ANY KIND',
  ])('reports a LICENSE missing the fragment %s', fragment => {
    seed({ license: LICENSE_TEXT.replace(fragment, 'PARAPHRASED') })

    expect(messages()).toContain(`does not contain the canonical fragment "${fragment}"`)
  })

  it('reports a SECURITY.md that never mentions private vulnerability reporting', () => {
    seed({ security: `# Security\nIf that button is not present, open an issue.\n${filler()}` })

    expect(messages()).toContain('does not reference GitHub private vulnerability reporting')
  })

  // Naming only the button would point at a control that may be switched off.
  it('reports a SECURITY.md that names private reporting with no fallback', () => {
    seed({ security: `# Security\nUse private vulnerability reporting.\n${filler()}` })

    expect(messages()).toContain('describes no fallback for when private vulnerability reporting is unavailable')
  })

  it('reports an email address in a governance document', () => {
    seed({ conduct: `# Code of Conduct\nContact maintainer@example.com for concerns.\n${filler()}` })

    expect(messages()).toContain('contains an email address')
  })

  // A Contributor Covenant URL is not a contact address.
  it('does not fire on a plain URL', () => {
    seed({ conduct: `# Code of Conduct\nhttps://www.contributor-covenant.org/version/2/1/code_of_conduct/\n${filler()}` })

    expect(messages()).not.toContain('email address')
  })

  it('does not fire on a bare @mention', () => {
    seed({ contributing: `# Contributing\nPing @knguyen30111 on the issue.\n${filler()}` })

    expect(messages()).not.toContain('email address')
  })

  it.each(['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/privacy.md'])(
    'reports a README that does not link %s',
    link => {
      const readme = ['# Lingo Leap', '', 'See [LICENSE](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [privacy](docs/privacy.md).', '']
        .join('\n')
        .replace(new RegExp(link.replace('.', '\\.'), 'g'), 'elsewhere')
      seed({ readme })

      expect(messages()).toContain(`README.md does not link ${link}`)
    }
  )

  it('reports a relative link that does not resolve', () => {
    seed({ privacy: `# Privacy\nSee [the plan](../plans/nope.md).\n${filler()}` })

    expect(messages()).toContain('docs/privacy.md links ../plans/nope.md, which does not exist')
  })

  it('resolves a docs link relative to the docs directory, not the repo root', () => {
    seed({ privacy: `# Privacy\nSee [release](release.md).\n${filler()}` })

    expect(messages()).not.toContain('links release.md')
  })

  it('ignores an anchor-only link', () => {
    seed({ privacy: `# Privacy\nSee [gates](#quality-gates).\n${filler()}` })

    expect(run()).toEqual([])
  })

  it('ignores an absolute URL', () => {
    seed({ privacy: `# Privacy\nSee [upstream](https://example.com/x.md).\n${filler()}` })

    expect(run()).toEqual([])
  })

  it('checks the path part of a link that carries a fragment', () => {
    seed({ privacy: `# Privacy\nSee [gates](nope.md#gates).\n${filler()}` })

    expect(messages()).toContain('links nope.md, which does not exist')
  })
})

describe('relativeLinkTargets', () => {
  it('collects relative paths only', () => {
    const markdown = '[a](a.md) [b](https://x/y.md) [c](#frag) [d](d.md#frag)'

    expect(relativeLinkTargets(markdown)).toEqual(['a.md', 'd.md'])
  })

  it('ignores a mailto link', () => {
    expect(relativeLinkTargets('[m](mailto:x@example.com)')).toEqual([])
  })
})
