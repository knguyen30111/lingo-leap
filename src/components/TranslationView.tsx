import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'
import { useTranslation as useTranslationHook } from '../hooks/useTranslation'
import { SUPPORTED_LANGUAGES, getLanguageNativeName } from '../lib/language'
import { LanguageSelector } from './LanguageSelector'
import { EditorInputPanel } from './editor/editor-input-panel'
import { EditorOutputBody } from './editor/editor-output-body'
import { EditorOutputActions } from './editor/editor-output-actions'

const SKELETON_WIDTHS = ['w-full', 'w-5/6', 'w-4/6', 'w-3/4']

export function TranslationView() {
  const { t } = useTranslation(['common', 'messages'])
  const {
    inputText, setInputText,
    outputText, setOutputText,
    isLoading, error, setError,
    sourceLang, setSourceLang,
    latestDetectedSourceLang,
    targetLang, setTargetLang
  } = useAppStore()
  const { translate } = useTranslationHook()

  const handleRegenerate = () => {
    if (inputText.trim()) {
      translate(undefined, { skipCache: true })
    }
  }

  const handleClearInput = () => {
    setInputText('')
    setOutputText('')
    setError(null)
  }

  // Auto stays the selected value; the detected language is only named in the
  // label, and only while auto is what the user actually asked for.
  const autoSourceLabel = sourceLang === 'auto' && latestDetectedSourceLang
    ? `${t('autoDetect')} (${getLanguageNativeName(latestDetectedSourceLang)})`
    : t('autoDetect')

  return (
    <div className="flex flex-col h-full">
      {/* Main Layout - Input | Swap | Output */}
      <div className="flex-1 flex gap-2 p-4 overflow-hidden">
        {/* Left: Input */}
        <EditorInputPanel
          className="flex-1 flex flex-col glass-card overflow-hidden relative"
          header={
            /* Source Language Header */
            <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="select-glass text-sm"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.code === 'auto' ? autoSourceLabel : lang.nativeName}
                  </option>
                ))}
              </select>
            </div>
          }
          value={inputText}
          onChange={setInputText}
          onClear={handleClearInput}
          onSubmit={handleRegenerate}
          placeholder={t('messages:placeholders.enterTextTranslate')}
          speechDisabled={isLoading}
        />

        {/* Center: Swap Button */}
        <div className="flex items-center justify-center">
          <LanguageSelector />
        </div>

        {/* Right: Output */}
        <div className="flex-1 flex flex-col glass-card">
          {/* Target Language Header */}
          <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="select-glass text-sm"
            >
              {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
          <EditorOutputBody
            isLoading={isLoading}
            error={error}
            outputText={outputText}
            placeholder={t('messages:placeholders.translationAppears')}
            skeletonWidths={SKELETON_WIDTHS}
          />
          <EditorOutputActions
            isLoading={isLoading}
            loadingLabel={t('translating')}
            outputText={outputText}
            onRegenerate={handleRegenerate}
            regenerateLabel={t('reTranslate')}
            submitLabel={t('translate')}
            submitTitle="Translate (⌘+Enter)"
            submitDisabled={!inputText.trim()}
          />
        </div>
      </div>
    </div>
  )
}
