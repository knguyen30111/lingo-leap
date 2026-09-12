import fs from 'node:fs'
import path from 'node:path'
import { finding } from '../lib/findings.mjs'

// Every application file has to keep its failure logging content-free.
//
// The privacy document makes this exact promise: failure paths log a fixed,
// content-free string, so opening the webview console never exposes what the
// user was translating. This rule is what makes that promise executable — a
// raw error object, an interpolated prompt, a model name, or any other value
// reaching the console is a finding.
//
// The check is lexical rather than type-aware, and the bright line it draws is
// deliberately simple: a console argument is either a fixed string literal or
// it is a finding. Anything looser would need to decide which expressions are
// safe to print, and that judgement is exactly what drifts.

const SRC_DIR = 'src'

const CHECKED_EXTENSIONS = ['.ts', '.tsx']

/** Test files may spy on console, and the harness file installs those spies. */
function isCheckable(relative) {
  if (!CHECKED_EXTENSIONS.some(ext => relative.endsWith(ext))) return false
  if (relative.endsWith('.d.ts')) return false
  if (/\.test\.tsx?$/.test(relative)) return false
  if (relative === `${SRC_DIR}/test-setup.ts`) return false
  return true
}

/** Every checkable file under src, repo-relative and sorted. Null when src is absent. */
export function listSourceFiles(root) {
  const base = path.join(root, SRC_DIR)
  let stack
  try {
    stack = [base]
    fs.readdirSync(base)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }

  const files = []
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolute)
        continue
      }
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      if (isCheckable(relative)) files.push(relative)
    }
  }
  return files.sort()
}

/**
 * The source with every comment and every string or template literal body
 * replaced by filler of the same length, so code structure can be scanned
 * without a parser while byte offsets and line numbers still line up with the
 * original text.
 *
 * Quote and backtick delimiters survive; their contents do not. A template
 * substitution is neutralised along with the rest of its literal, which is why
 * an interpolated message is recognised from the original text rather than
 * from the mask.
 */
export function maskNonCode(text) {
  const out = Array.from(text)
  const blank = index => { out[index] = text[index] === '\n' ? '\n' : ' ' }
  const fill = index => { out[index] = text[index] === '\n' ? '\n' : '_' }

  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)

    if (two === '//') {
      while (i < text.length && text[i] !== '\n') { blank(i); i += 1 }
      continue
    }
    if (two === '/*') {
      blank(i); blank(i + 1)
      i += 2
      while (i < text.length && text.slice(i, i + 2) !== '*/') { blank(i); i += 1 }
      if (i < text.length) { blank(i); blank(i + 1); i += 2 }
      continue
    }

    const quote = text[i]
    if (quote === '"' || quote === "'" || quote === '`') {
      i += 1
      let depth = 0
      while (i < text.length) {
        if (text[i] === '\\') { fill(i); fill(i + 1); i += 2; continue }
        if (quote === '`' && text.slice(i, i + 2) === '${') depth += 1
        if (quote === '`' && depth > 0 && text[i] === '}') depth -= 1
        else if (depth === 0 && text[i] === quote) { i += 1; break }
        fill(i)
        i += 1
      }
      continue
    }

    i += 1
  }

  return out.join('')
}

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchingParen(masked, open) {
  let depth = 0
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '(') depth += 1
    else if (masked[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Split an argument list on the commas that are not nested inside anything. */
function splitArguments(text, masked) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < masked.length; i += 1) {
    const char = masked[i]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push([start, i])
      start = i + 1
    }
  }
  parts.push([start, masked.length])
  return parts
    .map(([from, to]) => ({ text: text.slice(from, to), masked: masked.slice(from, to) }))
    .filter((part, index) => !(index === parts.length - 1 && part.text.trim() === '' && parts.length > 1) || false)
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/**
 * Every direct `console.<method>(...)` call, with its arguments as raw source
 * text and as masked text. Occurrences of `console` that are not a direct call
 * are reported by the rule instead, because an alias hides the logged value
 * from every lexical check including this one.
 */
export function consoleCalls(text) {
  const masked = maskNonCode(text)
  const calls = []
  const pattern = /\bconsole\b/g
  let match

  while ((match = pattern.exec(masked)) !== null) {
    const after = masked.slice(match.index + 'console'.length)
    const call = after.match(/^\s*\.\s*([A-Za-z0-9_$]+)\s*\(/)
    if (!call) continue

    const open = match.index + 'console'.length + call[0].length - 1
    const close = matchingParen(masked, open)
    if (close === -1) continue

    const inner = text.slice(open + 1, close)
    const innerMasked = masked.slice(open + 1, close)
    const args = inner.trim() === ''
      ? []
      : splitArguments(inner, innerMasked)

    calls.push({
      line: lineOf(text, match.index),
      method: call[1],
      args: args.map(a => a.text.trim()),
      maskedArgs: args.map(a => a.masked.trim()),
    })
    pattern.lastIndex = close
  }

  return calls
}

/** Non-call references to console, as {line, evidence}. */
export function strayConsoleReferences(text) {
  const masked = maskNonCode(text)
  const stray = []
  const pattern = /\bconsole\b/g
  let match

  while ((match = pattern.exec(masked)) !== null) {
    const after = masked.slice(match.index + 'console'.length)
    if (/^\s*\.\s*[A-Za-z0-9_$]+\s*\(/.test(after)) continue
    stray.push({
      line: lineOf(text, match.index),
      evidence: text.slice(match.index, match.index + 40).split('\n')[0].trim(),
    })
  }
  return stray
}

/** A masked argument is a literal when only its delimiters survived masking. */
export function isFixedLiteral(rawArg, maskedArg) {
  if (!/^(['"`])_*\1$/.test(maskedArg)) return false
  // The mask hides a template substitution, so interpolation is read from the
  // original text.
  return !(rawArg.startsWith('`') && rawArg.includes('${'))
}

export const loggingHygieneRule = {
  id: 'logging-hygiene',
  title: 'No application file writes a value to the console; failure paths log fixed messages only',
  check(ctx) {
    const findings = []

    const files = listSourceFiles(ctx.root)
    if (files === null) {
      findings.push(finding({
        message: `${SRC_DIR} is missing, so no file was checked for logging hygiene`,
        file: SRC_DIR,
      }))
      return findings
    }
    if (files.length === 0) {
      findings.push(finding({
        message: `no non-test src TypeScript file was found, so this rule would pass vacuously`,
        file: SRC_DIR,
      }))
      return findings
    }

    for (const file of files) {
      const text = ctx.readText(file)
      if (text === null) continue

      for (const { line, evidence } of strayConsoleReferences(text)) {
        findings.push(finding({
          message: `${file} references console without calling it directly`,
          file,
          line,
          evidence,
        }))
      }

      for (const call of consoleCalls(text)) {
        if (call.args.length === 0) {
          findings.push(finding({
            message: `${file} calls console with no message`,
            file,
            line: call.line,
            evidence: `console.${call.method}()`,
          }))
          continue
        }
        call.args.forEach((raw, index) => {
          if (isFixedLiteral(raw, call.maskedArgs[index])) return
          const interpolated = raw.startsWith('`') && raw.includes('${')
          findings.push(finding({
            message: interpolated
              ? `${file} logs an interpolated message, which can carry a prompt, model output, or user text`
              : `${file} logs a value rather than a fixed message`,
            file,
            line: call.line,
            evidence: raw,
          }))
        })
      }
    }

    return findings
  },
}
