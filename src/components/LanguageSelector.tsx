import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { SUPPORTED_LANGUAGES } from '../lib/language'

export function LanguageSelector() {
  const { t } = useTranslation('common')
  const {
    sourceLang, setSourceLang,
    targetLang, setTargetLang,
    inputText, setInputText,
    outputText, setOutputText,
    mode
  } = useAppStore()
  const { explanationLang, setExplanationLang } = useSettingsStore()
  const [isRotated, setIsRotated] = useState(false)

  // Swap languages and text
  const handleSwap = () => {
    if (sourceLang === 'auto') return

    // Trigger rotation animation
    setIsRotated(prev => !prev)

    // Swap languages
    const tempLang = sourceLang
    setSourceLang(targetLang)
    setTargetLang(tempLang)

    // Swap input and output text if there's output
    if (outputText) {
      const tempText = inputText
      setInputText(outputText)
      setOutputText(tempText)
    }
  }

  // For correction mode, show explanation language selector
  // Input language is always auto-detected
  if (mode === 'correct') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)]">{t('explainIn')}</span>
        <select
          value={explanationLang}
          onChange={(e) => setExplanationLang(e.target.value)}
          className="select-glass"
        >
          <option value="auto">{t('sameAsInput')}</option>
          {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.nativeName}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <button
      onClick={handleSwap}
      disabled={sourceLang === 'auto'}
      className={`
        lang-swap-button
        ${isRotated ? 'rotate-180' : 'rotate-0'}
      `}
      title={t('swapLanguages')}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    </button>
  )
}
