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

function getCorrectionSystemPrompt(langName: string, level: CorrectionLevel): string {
  const baseRules = `You are a ${langName} language expert.

CRITICAL LANGUAGE RULES:
- Input language: ${langName}
- Output language: MUST be ${langName} ONLY
- NEVER translate to another language
- NEVER mix characters from other languages
- Japanese text -> Japanese output only
- Vietnamese text -> Vietnamese output only
- Chinese text -> Chinese output only`

  const tasks: Record<CorrectionLevel, string> = {
    fix: `

TASK: Fix spelling and grammar errors ONLY.
- Keep exact same words, style, structure
- Minimal corrections only
- Do NOT improve or rewrite
- Output ONLY the corrected text, nothing else`,

    improve: `

TASK: Improve the text while preserving meaning.
1. Fix all spelling and grammar errors
2. Replace weak words with stronger alternatives
3. Improve sentence flow and clarity
4. Keep the original meaning intact
- Output ONLY the improved text, nothing else`,

    rewrite: `

TASK: Professionally rewrite the text.
1. Completely rewrite for natural, professional flow
2. Use sophisticated vocabulary appropriate for ${langName}
3. Maintain professional tone
4. Preserve the core message
- Output ONLY the rewritten text, nothing else`
  }

  return baseRules + tasks[level]
}

export function buildCorrectionPrompt(
  text: string,
  language: string,
  level: CorrectionLevel,
  modelName: string
): PromptResult {
  const langName = getLanguageName(language)
  const system = getCorrectionSystemPrompt(langName, level)

  const levelVerbs: Record<CorrectionLevel, string> = {
    fix: 'Fix errors in',
    improve: 'Improve',
    rewrite: 'Rewrite'
  }

  const user = `${levelVerbs[level]} this ${langName} text:\n\n${text}`

  console.log('[Prompt] Building correction prompt for language:', language, langName)
  console.log('[Prompt] Model:', modelName)
  console.log('[Prompt] System:', system.substring(0, 200) + '...')

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
Output ONLY the translation, nothing else.`

  const user = `Translate from ${source} to ${target}:\n\n${text}`

  return wrapPrompt(system, user, modelName)
}
