import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Readers return a distinguishable absent value rather than throwing ENOENT.
// A rule that asks for a file the repository does not have is reporting a
// finding, not crashing, and the difference has to survive the reader or a
// rule bug becomes indistinguishable from a checker bug.

/** The repository root this checker ships inside: scripts/release-contract/lib -> repo. */
export function defaultRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..', '..')
}

/**
 * Reads `--root <dir>` out of an argv list. This is the injection point every
 * negative check uses: a rule is proven to fail by pointing it at a fixture
 * tree, never by corrupting a tracked file and restoring it afterwards.
 */
export function repoRootFromArgv(argv, fallback = defaultRepoRoot()) {
  const index = argv.indexOf('--root')
  if (index === -1) return fallback
  const value = argv[index + 1]
  if (!value) throw new Error('--root requires a directory argument')
  return path.resolve(value)
}

export function createRepo(root) {
  const resolve = relative => path.join(root, relative)

  const exists = relative => fs.existsSync(resolve(relative))

  /** @returns {string|null} null when the file is absent. */
  const readText = relative => {
    try {
      return fs.readFileSync(resolve(relative), 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return null
      throw err
    }
  }

  /** @returns {string[]|null} null when the file is absent. */
  const readLines = relative => {
    const text = readText(relative)
    return text === null ? null : text.split('\n')
  }

  /**
   * @returns {{ok: true, value: unknown}|{ok: false, reason: 'missing'|'invalid', error?: string}}
   * Malformed JSON is distinguished from an absent file, because a rule wants
   * to say which one it found.
   */
  const readJson = relative => {
    const text = readText(relative)
    if (text === null) return { ok: false, reason: 'missing' }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch (err) {
      return { ok: false, reason: 'invalid', error: err.message }
    }
  }

  /** Repo-relative paths of every workflow file, sorted. Empty when absent. */
  const listWorkflowFiles = () => {
    const dir = resolve('.github/workflows')
    let entries
    try {
      entries = fs.readdirSync(dir)
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
    return entries
      .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
      .sort()
      .map(name => `.github/workflows/${name}`)
  }

  return { root, exists, readText, readLines, readJson, listWorkflowFiles }
}
