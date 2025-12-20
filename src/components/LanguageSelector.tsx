import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { SUPPORTED_LANGUAGES } from '../lib/language'

export function LanguageSelector() {
  const {
    sourceLang, setSourceLang,
    targetLang, setTargetLang,
    inputText, setInputText,
    outputText, setOutputText,
    mode
  } = useAppStore()
  const { explanationLang, setExplanationLang } = useSettingsStore()
  const [isRotated, setIsRotated] = useState(false)

  const handleSwap = () => {
    if (sourceLang !== 'auto' && outputText) {
      // Trigger rotation animation
      setIsRotated(prev => !prev)

      // Swap languages
      const tempLang = sourceLang
      setSourceLang(targetLang)
      setTargetLang(tempLang)

      // Swap input and output text
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
        <span className="text-xs text-[var(--text-secondary)]">Explain in:</span>
        <select
          value={explanationLang}
          onChange={(e) => setExplanationLang(e.target.value)}
          className="select-glass"
        >
          <option value="auto">Same as input</option>
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
    <div className="flex items-center gap-3">
      <select
        value={sourceLang}
        onChange={(e) => setSourceLang(e.target.value)}
        className="select-glass"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.code === 'auto' ? 'Auto Detect' : lang.nativeName}
          </option>
        ))}
      </select>

      {/* Swap Button with Animation */}
      <button
        onClick={handleSwap}
        disabled={sourceLang === 'auto' || !outputText}
        className={`
          glass-button p-2
          hover:bg-[var(--accent-blue)] hover:text-white hover:border-[var(--accent-blue)]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--glass-bg)] disabled:hover:text-[var(--text-secondary)] disabled:hover:border-[var(--glass-border)]
          transition-all duration-300 ease-out
          ${isRotated ? 'rotate-180' : 'rotate-0'}
        `}
        title="Swap languages"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </button>

      <select
        value={targetLang}
        onChange={(e) => setTargetLang(e.target.value)}
        className="select-glass"
      >
        {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </select>
    </div>
  )
}
