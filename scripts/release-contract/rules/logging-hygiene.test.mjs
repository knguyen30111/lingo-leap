// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRepo } from '../lib/repo.mjs'
import { loggingHygieneRule, consoleCalls, maskNonCode } from './logging-hygiene.mjs'

let fixture

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'logging-hygiene-'))
})

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true })
})

function write(relative, contents) {
  const target = path.join(fixture, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}

function run() {
  return loggingHygieneRule.check({ ...createRepo(fixture), root: fixture })
}

function messages() {
  return run().map(entry => entry.message).join('\n')
}

describe('logging-hygiene rule: what stays allowed', () => {
  it('reports nothing for a fixed single-quoted message', () => {
    write('src/a.ts', "export const f = () => { console.error('[Changes] Extraction failed') }\n")

    expect(run()).toEqual([])
  })

  it('reports nothing for a fixed double-quoted message', () => {
    write('src/a.ts', 'export const f = () => { console.warn("Failed to copy") }\n')

    expect(run()).toEqual([])
  })

  it('reports nothing for a template literal with no substitution', () => {
    write('src/a.ts', 'export const f = () => { console.info(`Failed to activate voice session`) }\n')

    expect(run()).toEqual([])
  })

  it('reports nothing for several fixed messages in one call', () => {
    write('src/a.ts', "export const f = () => { console.error('[Speech]', 'recognition failed') }\n")

    expect(run()).toEqual([])
  })

  it('reports nothing for a src tree with no console call at all', () => {
    write('src/a.ts', 'export const f = (x: number) => x + 1\n')

    expect(run()).toEqual([])
  })

  it('ignores the word console inside a comment', () => {
    write('src/a.ts', '// Nothing is written to the console here.\nexport const f = () => 1\n')

    expect(run()).toEqual([])
  })

  it('ignores the word console inside a string literal', () => {
    write('src/a.ts', "export const label = 'open the console to see nothing'\n")

    expect(run()).toEqual([])
  })

  it('ignores test files, which may spy on console', () => {
    write('src/a.ts', 'export const f = (x: number) => x + 1\n')
    write('src/a.test.ts', "vi.spyOn(console, 'error').mockImplementation(() => {})\nconsole.error(err)\n")

    expect(run()).toEqual([])
  })

  it('ignores the test harness setup file', () => {
    write('src/a.ts', 'export const f = (x: number) => x + 1\n')
    write('src/test-setup.ts', "vi.spyOn(console, 'warn')\n")

    expect(run()).toEqual([])
  })

  it('ignores declaration files', () => {
    write('src/a.ts', 'export const f = (x: number) => x + 1\n')
    write('src/globals.d.ts', 'declare const console: { log(value: unknown): void }\n')

    expect(run()).toEqual([])
  })
})

describe('logging-hygiene rule: what is rejected', () => {
  it('rejects a raw error object', () => {
    write('src/a.ts', 'export const f = (error: unknown) => { console.error(error) }\n')

    expect(messages()).toContain('src/a.ts logs a value rather than a fixed message')
    expect(run()[0].evidence).toBe('error')
    expect(run()[0].line).toBe(1)
  })

  it('rejects a caught error passed straight through', () => {
    write('src/a.ts', 'export const f = () => { try { g() } catch (err) { console.warn(err) } }\n')

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects an error object alongside a fixed message', () => {
    write('src/a.ts', "export const f = (err: Error) => { console.error('failed', err) }\n")

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects an interpolated prompt', () => {
    write('src/a.ts', 'export const f = (prompt: string) => { console.debug(`prompt: ${prompt}`) }\n')

    expect(messages()).toContain(
      'src/a.ts logs an interpolated message, which can carry a prompt, model output, or user text'
    )
  })

  it('rejects a logged model name', () => {
    write('src/a.ts', 'export const f = (model: string) => { console.log(model) }\n')

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects logged user content reached through a property', () => {
    write('src/a.ts', 'export const f = (s: { inputText: string }) => { console.log(s.inputText) }\n')

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects a message concatenated with a value', () => {
    write('src/a.ts', "export const f = (text: string) => { console.error('input: ' + text) }\n")

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects a call with no message at all', () => {
    write('src/a.ts', 'export const f = () => { console.trace() }\n')

    expect(messages()).toContain('src/a.ts calls console with no message')
  })

  it('rejects aliasing console so the call site hides the logged value', () => {
    write('src/a.ts', 'const sink = console.error\nexport const f = (err: unknown) => sink(err)\n')

    expect(messages()).toContain('src/a.ts references console without calling it directly')
  })

  it('rejects a console call reached through globalThis', () => {
    write('src/a.ts', 'export const f = (err: unknown) => { globalThis.console.error(err) }\n')

    expect(messages()).toContain('logs a value rather than a fixed message')
  })

  it('rejects a multi-line call as readily as a single-line one', () => {
    write('src/a.tsx', 'export const f = (err: unknown) => {\n  console.error(\n    err,\n  )\n}\n')

    const entries = run()
    expect(entries.map(e => e.message).join('\n')).toContain('logs a value rather than a fixed message')
    expect(entries[0].line).toBe(2)
  })

  it('reports every offending file, not only the first', () => {
    write('src/a.ts', 'export const f = (err: unknown) => { console.error(err) }\n')
    write('src/nested/b.tsx', 'export const g = (err: unknown) => { console.warn(err) }\n')

    expect(run()).toHaveLength(2)
    expect(run().map(e => e.file).sort()).toEqual(['src/a.ts', 'src/nested/b.tsx'])
  })

  it('reports an absent src directory rather than passing vacuously', () => {
    expect(messages()).toContain('src is missing, so no file was checked for logging hygiene')
  })

  it('reports a src directory holding no checkable file', () => {
    write('src/a.test.ts', "console.error('x')\n")

    expect(messages()).toContain('no non-test src TypeScript file was found')
  })
})

describe('maskNonCode', () => {
  it('keeps code positions and neutralises string contents', () => {
    const source = "const a = 'console.log(x)'"
    const masked = maskNonCode(source)

    expect(masked).toHaveLength(source.length)
    expect(masked).toBe(`const a = '${'_'.repeat('console.log(x)'.length)}'`)
  })

  it('neutralises line comments', () => {
    expect(maskNonCode('a // console.log(b)')).toBe('a                  ')
  })

  it('neutralises block comments across lines but keeps newlines', () => {
    expect(maskNonCode('a /* console\n.log */ b')).toBe('a           \n        b')
  })

  it('neutralises a template literal including its substitution', () => {
    expect(maskNonCode('f(`a ${b} c`)')).toBe('f(`________`)')
  })

  it('respects escaped quotes', () => {
    // The literal is a, an escaped quote, b — four characters inside the quotes.
    expect(maskNonCode("f('a\\'b')")).toBe("f('____')")
  })
})

describe('consoleCalls', () => {
  it('reports the method and the raw argument text', () => {
    const calls = consoleCalls("console.error('boom')")

    expect(calls).toEqual([{ line: 1, method: 'error', args: ["'boom'"], maskedArgs: ["'____'"] }])
  })

  it('finds a call that spans lines and reports the line it starts on', () => {
    const calls = consoleCalls('\n\nconsole.warn(\n  a,\n  b\n)')

    expect(calls[0].line).toBe(3)
    expect(calls[0].args).toEqual(['a', 'b'])
  })

  it('does not split a comma inside a nested call', () => {
    const calls = consoleCalls("console.log(f(a, b))")

    expect(calls[0].args).toEqual(['f(a, b)'])
  })

  it('does not split a comma inside a string', () => {
    const calls = consoleCalls("console.log('a, b')")

    expect(calls[0].args).toEqual(["'a, b'"])
  })
})
