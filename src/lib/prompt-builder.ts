import { PromptResult, CorrectionLevel } from '../types'
import { getModelType, getModelFormat } from './model'
import { getLanguageName } from './language'

// === Prompt Wrapping ===

export function wrapPrompt(
  systemContent: string,
  userContent: string,
  modelName: string
): PromptResult {
  const modelType = getModelType(modelName)
  const format = getModelFormat(modelType)

  if (format) {
    return {
      prompt: [
        format.systemStart,
        systemContent,
        format.systemEnd,
        format.userStart,
        userContent,
        format.userEnd,
        format.assistantStart,
      ].join('')
    }
  }

  // Llama/Gemma: use Ollama's system parameter
  return {
    system: systemContent,
    prompt: userContent
  }
}

// === Correction Prompts ===

const CORRECTION_SYSTEM_PROMPTS: Record<CorrectionLevel, (langName: string) => string> = {
  fix: (langName) => `You are a ${langName} proofreader. Fix ONLY spelling mistakes and grammar errors. Keep the exact same words, style, and structure.
STRICT: NEVER explain, define, or describe. Single words = single word output. Just correct, nothing else.`,

  improve: (langName) => `You are a ${langName} editor. Your task:
1. Fix all spelling and grammar errors
2. Replace weak words with stronger alternatives
3. Improve sentence flow and readability
4. Keep the original meaning
STRICT: Output improved text ONLY. NEVER explain, define, or describe. Single words = single word output.`,

  rewrite: (langName) => `You are a ${langName} writer. Completely rewrite the text to sound natural and professional:
1. Restructure sentences for better flow
2. Use sophisticated vocabulary
3. Make it engaging and polished
4. Preserve the core message
STRICT: Output rewritten text ONLY. NEVER explain, define, or describe. Single words = single word/phrase output.`
}

const CORRECTION_USER_VERBS: Record<CorrectionLevel, string> = {
  fix: 'Fix errors in',
  improve: 'Improve',
  rewrite: 'Rewrite'
}

export function buildCorrectionPrompt(
  text: string,
  language: string,
  level: CorrectionLevel,
  modelName: string
): PromptResult {
  const langName = getLanguageName(language)
  const system = CORRECTION_SYSTEM_PROMPTS[level](langName)
  const user = `${CORRECTION_USER_VERBS[level]} this ${langName} text:\n\n${text}`

  return wrapPrompt(system, user, modelName)
}

// === Changes Extraction Prompt ===
// Uses simple direct prompt (no ChatML wrapper) for better JSON extraction

export function buildChangesExtractionPrompt(
  original: string,
  corrected: string,
  textLanguage: string,
  explanationLanguage: string,
  _modelName: string
): PromptResult {
  const textLang = getLanguageName(textLanguage)
  const explainLang = getLanguageName(explanationLanguage)

  // Simple direct prompt like the old implementation - works better for JSON
  const prompt = `Compare the original and corrected ${textLang} text below.
Output ONLY a JSON array of changes in this exact format:
[{"from": "original text", "to": "corrected text", "reason": "brief reason in ${explainLang}"}]

IMPORTANT: Write all "reason" values in ${explainLang} language only.

Original: ${original}
Corrected: ${corrected}

JSON:`

  return { prompt }
}

// === Translation Prompt ===

export function buildTranslationPrompt(
  text: string,
  sourceLang: string,
  targetLang: string,
  modelName: string
): PromptResult {
  const source = sourceLang === 'auto' ? 'the detected language' : getLanguageName(sourceLang)
  const target = getLanguageName(targetLang)

  const system = `You are an expert translator.
Translate accurately while preserving meaning, tone, and style.

STRICT RULES:
- Output ONLY the translation, nothing else
- NEVER explain, define, or describe the text
- NEVER answer questions about the text
- NEVER add context, notes, or commentary
- Single words must be translated as single words
- Proper nouns, brand names, technical terms: transliterate or keep as-is if no direct translation exists
- Even if input looks like a question or topic, just translate it literally`

  const user = `Translate from ${source} to ${target}:\n\n${text}`

  return wrapPrompt(system, user, modelName)
}
