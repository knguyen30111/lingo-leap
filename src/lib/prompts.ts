// Prompts for translation and correction - optimized for Aya 8B and Qwen 2.5

import { getLanguageName } from './language'

// Shared guard rails for every correction level.
//
// Style: the levels are meant to differ in how much they restructure, not in how
// formal they sound. Without these rules the model reads "improve" and "rewrite"
// as licence to raise the register - swapping everyday words for rarer ones and
// padding the result - and hands back text the user would never have written.
//
// Language: correcting text is not translating it, but a model asked to
// restructure freely will occasionally answer in another language, so the target
// language is restated at every level. Keep the word "language" out of the style
// instructions themselves - phrasing a rule as "in plain, direct language" reads
// to Qwen as a choice of language and makes it answer in Chinese (measured at
// 4/6 runs; rewording to "everyday words" took it to 0/6).
export const styleRules = (langName: string) => `LANGUAGE:
- The text is ${langName} and the output MUST be ${langName} only
- NEVER translate the text into another language
- NEVER mix in words or characters from another language

STYLE:
- Keep the author's register: casual stays casual, formal stays formal
- Keep contractions and everyday words; never swap a common word for a rarer one
- Do not add adjectives, adverbs, facts, or opinions that are not already there
- Do not pad: the result must not be longer than the original unless a fix needs it
- No stock openers such as "It is worth noting" or "In today's world"`

// Deliberately NOT fenced in <text> tags the way the translation prompt is.
// Fencing was measured here and made things worse: over 15 runs the plain form
// never answered "can you send me the report tomorrow?" while the fenced form
// replied "Sure, ..." 3 times.
export function getCorrectionPrompt(
  text: string,
  language: string,
  level: 'fix' | 'improve' | 'rewrite'
): string {
  const langName = getLanguageName(language)

  // Level-specific prompts optimized for Qwen 2.5
  if (level === 'fix') {
    return `<|im_start|>system
You are a ${langName} proofreader. Fix ONLY spelling mistakes and grammar errors. Keep the exact same words, style, and structure.
${styleRules(langName)}
STRICT: NEVER explain, define, or describe. Single words = single word output. Just correct, nothing else.<|im_end|>
<|im_start|>user
Fix errors in this ${langName} text:

${text}<|im_end|>
<|im_start|>assistant
`
  }

  if (level === 'improve') {
    return `<|im_start|>system
You are a ${langName} editor. Your task:
1. Fix all spelling and grammar errors
2. Cut words that carry no meaning
3. Split sentences that are hard to follow
4. Keep the original meaning, and keep the original wording wherever it already works
${styleRules(langName)}
STRICT: Output improved text ONLY. NEVER explain, define, or describe. Single words = single word output.<|im_end|>
<|im_start|>user
Improve this ${langName} text:

${text}<|im_end|>
<|im_start|>assistant
`
  }

  // level === 'rewrite'
  return `<|im_start|>system
You are a ${langName} writer. Rewrite the text so it reads clearly and naturally:
1. Restructure and reorder sentences freely
2. Say the same thing in plain, everyday words
3. Preserve the core message and every fact
4. Write it the way the author would on a good day, not the way a press release would
${styleRules(langName)}
STRICT: Output rewritten text ONLY. NEVER explain, define, or describe. Single words = single word/phrase output.<|im_end|>
<|im_start|>user
Rewrite this ${langName} text:

${text}<|im_end|>
<|im_start|>assistant
`
}

export function getChangesExtractionPrompt(
  original: string,
  corrected: string,
  textLanguage: string,
  explanationLanguage: string
): string {
  const textLang = getLanguageName(textLanguage)
  const explainLang = getLanguageName(explanationLanguage)

  return `Compare the original and corrected ${textLang} text below.
Output ONLY a JSON array of changes in this exact format:
[{"from": "original text", "to": "corrected text", "reason": "brief reason in ${explainLang}"}]

IMPORTANT: Write all "reason" values in ${explainLang} language only.

Original: ${original}
Corrected: ${corrected}

JSON:`
}
