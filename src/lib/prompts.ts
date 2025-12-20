// Prompts for translation and correction - optimized for Aya 8B and Qwen 2.5

import { getLanguageName } from './language'

export function getTranslationPrompt(
  text: string,
  sourceLang: string,
  targetLang: string
): string {
  const source = sourceLang === 'auto' ? 'the detected language' : getLanguageName(sourceLang)
  const target = getLanguageName(targetLang)

  // Optimized prompt for Aya 8B - concise and direct
  return `<|system|>You are an expert translator. Translate accurately while preserving meaning, tone, and style. Output ONLY the translation, nothing else.<|end|>
<|user|>Translate from ${source} to ${target}:

${text}<|end|>
<|assistant|>`
}

export function getCorrectionPrompt(
  text: string,
  language: string,
  level: 'fix' | 'improve' | 'rewrite'
): string {
  const langName = getLanguageName(language)

  // Level-specific prompts optimized for Qwen 2.5
  if (level === 'fix') {
    return `<|im_start|>system
You are a ${langName} proofreader. Fix ONLY spelling mistakes and grammar errors. Keep the exact same words, style, and structure. Do not change anything else.<|im_end|>
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
2. Replace weak or vague words with stronger, more precise alternatives
3. Improve sentence flow and readability
4. Keep the original meaning and tone

Output the improved text only, no explanations.<|im_end|>
<|im_start|>user
Improve this ${langName} text:

${text}<|im_end|>
<|im_start|>assistant
`
  }

  // level === 'rewrite'
  return `<|im_start|>system
You are a ${langName} writer. Completely rewrite the text to sound natural and professional:
1. Restructure sentences for better flow
2. Use more sophisticated vocabulary
3. Make it engaging and polished
4. Preserve the core message but express it better

Output the rewritten text only, no explanations.<|im_end|>
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
