import { useMemo } from 'react'

interface DiffSegment {
  type: 'unchanged' | 'removed' | 'added'
  text: string
}

// Simple word-level diff algorithm
function computeDiff(original: string, corrected: string): DiffSegment[] {
  const originalWords = original.split(/(\s+)/)
  const correctedWords = corrected.split(/(\s+)/)

  const segments: DiffSegment[] = []

  // Use longest common subsequence approach
  const lcs = computeLCS(originalWords, correctedWords)

  let origIdx = 0
  let corrIdx = 0
  let lcsIdx = 0

  while (origIdx < originalWords.length || corrIdx < correctedWords.length) {
    // If we've processed all LCS elements
    if (lcsIdx >= lcs.length) {
      // Remaining original words are removed
      while (origIdx < originalWords.length) {
        if (originalWords[origIdx].trim()) {
          segments.push({ type: 'removed', text: originalWords[origIdx] })
        } else {
          segments.push({ type: 'unchanged', text: originalWords[origIdx] })
        }
        origIdx++
      }
      // Remaining corrected words are added
      while (corrIdx < correctedWords.length) {
        if (correctedWords[corrIdx].trim()) {
          segments.push({ type: 'added', text: correctedWords[corrIdx] })
        } else {
          segments.push({ type: 'unchanged', text: correctedWords[corrIdx] })
        }
        corrIdx++
      }
      break
    }

    const lcsWord = lcs[lcsIdx]

    // Skip removed words (in original but not matching current LCS)
    while (origIdx < originalWords.length && originalWords[origIdx] !== lcsWord) {
      if (originalWords[origIdx].trim()) {
        segments.push({ type: 'removed', text: originalWords[origIdx] })
      } else {
        segments.push({ type: 'unchanged', text: originalWords[origIdx] })
      }
      origIdx++
    }

    // Skip added words (in corrected but not matching current LCS)
    while (corrIdx < correctedWords.length && correctedWords[corrIdx] !== lcsWord) {
      if (correctedWords[corrIdx].trim()) {
        segments.push({ type: 'added', text: correctedWords[corrIdx] })
      } else {
        segments.push({ type: 'unchanged', text: correctedWords[corrIdx] })
      }
      corrIdx++
    }

    // Add the matching LCS word as unchanged
    if (origIdx < originalWords.length && corrIdx < correctedWords.length) {
      segments.push({ type: 'unchanged', text: originalWords[origIdx] })
      origIdx++
      corrIdx++
      lcsIdx++
    }
  }

  // Merge adjacent segments of same type
  return mergeSegments(segments)
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return lcs
}

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  if (segments.length === 0) return []

  const merged: DiffSegment[] = []
  let current = { ...segments[0] }

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].type === current.type) {
      current.text += segments[i].text
    } else {
      merged.push(current)
      current = { ...segments[i] }
    }
  }
  merged.push(current)

  return merged
}

interface InlineDiffProps {
  original: string
  corrected: string
}

export function InlineDiff({ original, corrected }: InlineDiffProps) {
  const segments = useMemo(() => computeDiff(original, corrected), [original, corrected])

  // Count changes
  const changeCount = segments.filter(s => s.type !== 'unchanged').length

  if (changeCount === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm italic">
        No changes made - text is already correct
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400"></span>
          Removed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          Added
        </span>
        <span className="text-gray-400">•</span>
        <span>{Math.ceil(changeCount / 2)} change{changeCount > 2 ? 's' : ''}</span>
      </div>
      <div className="text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">
        {segments.map((segment, i) => {
          if (segment.type === 'removed') {
            return (
              <span
                key={i}
                className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 line-through decoration-red-400"
              >
                {segment.text}
              </span>
            )
          }
          if (segment.type === 'added') {
            return (
              <span
                key={i}
                className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 underline decoration-green-400 decoration-2"
              >
                {segment.text}
              </span>
            )
          }
          return <span key={i}>{segment.text}</span>
        })}
      </div>
    </div>
  )
}
