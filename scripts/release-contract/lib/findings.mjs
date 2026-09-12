// A finding is data, not a printed line. Rules return arrays of these and the
// CLI decides how to render them, so a rule stays testable without capturing
// stdout and the output can be regrouped without touching any rule.

/**
 * @param {object} input
 * @param {string} input.message   what is wrong, in one sentence
 * @param {string} [input.file]    repo-relative path the finding is about
 * @param {number} [input.line]    1-indexed line within that file
 * @param {string} [input.evidence] the text that proves it
 */
export function finding({ message, file, line, evidence }) {
  if (typeof message !== 'string' || message.length === 0) {
    throw new TypeError('a finding needs a message')
  }
  return {
    message,
    file: file ?? null,
    line: typeof line === 'number' ? line : null,
    evidence: evidence ?? null,
  }
}

/**
 * One finding as a human-readable block. The location line is omitted entirely
 * when a finding has no file, rather than printed as "null".
 */
export function formatFinding(entry) {
  const lines = [`  - ${entry.message}`]
  if (entry.file) {
    lines.push(`    at ${entry.file}${entry.line === null ? '' : `:${entry.line}`}`)
  }
  if (entry.evidence !== null && entry.evidence !== undefined) {
    lines.push(`    evidence: ${entry.evidence}`)
  }
  return lines.join('\n')
}

/** All findings for one rule, under a heading that names the rule. */
export function formatRuleFindings(ruleId, title, entries) {
  return [`${ruleId} — ${title}`, ...entries.map(formatFinding)].join('\n')
}
