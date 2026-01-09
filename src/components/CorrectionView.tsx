import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useCorrection } from '../hooks/useCorrection';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { LanguageSelector } from './LanguageSelector';
import { CorrectionTabs } from './CorrectionTabs';
import { MicButton } from './MicButton';
import { SpeechPreview } from './SpeechPreview';
import { ClearInputButton } from './ClearInputButton';

const SPEECH_LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: 'JA' },
  { code: 'vi', label: 'VI' },
  { code: 'zh', label: 'ZH' },
  { code: 'ko', label: 'KO' },
];

export function CorrectionView() {
  const { t } = useTranslation(['common', 'messages']);
  const {
    inputText,
    setInputText,
    outputText,
    setOutputText,
    isLoading,
    error,
    setError,
    changes,
    setChanges,
    isChangesLoading,
  } = useAppStore();
  const { speechLang, setSpeechLang } = useSettingsStore();
  const { correct } = useCorrection();
  const [copied, setCopied] = useState(false);

  // Callback to append speech text to input
  const handleTextReady = useCallback(
    (text: string) => {
      const current = useAppStore.getState().inputText;
      setInputText(current ? current + ' ' + text : text);
    },
    [setInputText]
  );

  // Speech-to-text hook with continuous mode
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    silenceDetected,
    toggleListening,
  } = useSpeechToText({
    lang: speechLang,
    onTextReady: handleTextReady,
  });

  const handleCopy = async () => {
    if (!outputText) return;
    try {
      await writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleRegenerate = () => {
    if (inputText.trim()) {
      correct(undefined, undefined, { skipCache: true });
    }
  };

  const handleClearInput = () => {
    setInputText('');
    setOutputText('');
    setError(null);
    setChanges([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to generate
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRegenerate();
    }
  };

  const hasChanges = changes.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
        <LanguageSelector />
        <CorrectionTabs />
      </div>

      {/* Main Grid Layout - 1/3 input, 2/3 output */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full grid grid-cols-3 gap-4">
          {/* Left: Input (1/3) */}
          <div className="min-h-0 flex flex-col glass-card overflow-hidden relative">
            <ClearInputButton
              onClick={handleClearInput}
              visible={inputText.length > 0}
            />
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('messages:placeholders.enterTextCorrect')}
              className="
              flex-1 p-4 pr-10 bg-transparent resize-none
              text-[var(--text-primary)] text-base leading-relaxed
              placeholder:text-[var(--text-tertiary)]
              focus:outline-none
            "
            />
            <div className="px-3 py-1.5 border-t border-[var(--border-color)] flex items-center justify-between">
              {/* Left: Mic button with language selector */}
              <div className="flex items-center">
                <div className="relative">
                  <div className="button-group">
                    <MicButton
                      isListening={isListening}
                      isSupported={isSupported}
                      silenceDetected={silenceDetected}
                      onClick={toggleListening}
                      disabled={isLoading}
                    />
                    {isSupported && (
                      <select
                        value={speechLang}
                        onChange={(e) => setSpeechLang(e.target.value)}
                        className="speech-lang-select"
                        title="Speech language"
                      >
                        {SPEECH_LANGS.map(({ code, label }) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <SpeechPreview
                    isVisible={isListening}
                    transcript={transcript}
                    interimTranscript={interimTranscript}
                  />
                </div>
              </div>
              {/* Right: Char count */}
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {inputText.length} {t('chars')}
              </span>
            </div>
          </div>

          {/* Right: Output + Changes (2/3 - Two Stacked Rectangles) */}
          <div className="col-span-2 min-h-0 grid grid-rows-[1fr_1fr] gap-4">
            {/* Top Right: Corrected Output */}
            <div className="min-h-0 flex flex-col glass-card overflow-hidden">
              <div className="flex-1 p-4 overflow-auto">
                {isLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-[var(--glass-bg)] rounded w-full"></div>
                    <div className="h-4 bg-[var(--glass-bg)] rounded w-5/6"></div>
                    <div className="h-4 bg-[var(--glass-bg)] rounded w-4/6"></div>
                  </div>
                ) : error ? (
                  <div className="text-[var(--error)] text-sm">{error}</div>
                ) : outputText ? (
                  <div className="text-[var(--text-primary)] text-base leading-relaxed whitespace-pre-wrap">
                    {outputText}
                  </div>
                ) : (
                  <div className="text-[var(--text-tertiary)] text-sm">
                    {t('messages:placeholders.correctedAppears')}
                  </div>
                )}
              </div>
              {/* Action footer */}
              <div className="px-3 py-2 border-t border-[var(--border-color)] flex items-center justify-between">
                {isLoading ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-blue)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-blue)]"></span>
                      </span>
                      <span className="text-xs text-[var(--accent-blue)]">
                        {t('processing')}
                      </span>
                    </div>
                    <div />
                  </>
                ) : outputText ? (
                  <>
                    <div className="flex items-center gap-1.5 text-[var(--success)]">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-xs">{t('done')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRegenerate}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-md transition-colors"
                        title={t('regenerate')}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <span>{t('regenerate')}</span>
                      </button>
                      <button
                        onClick={handleCopy}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium border rounded-md transition-colors ${
                          copied
                            ? 'text-[var(--success)] border-[var(--success)] bg-[var(--success)]/10'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border-[var(--border-color)]'
                        }`}
                        title={t('copy')}
                      >
                        {copied ? (
                          <>
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span>{t('copied')}</span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            <span>{t('copy')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div />
                    <button
                      onClick={handleRegenerate}
                      disabled={!inputText.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-[var(--border-color)] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Generate (⌘+Enter)"
                    >
                      {t('generate')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Bottom Right: Changes/Explanations */}
            <div className="min-h-0 flex flex-col glass-card overflow-hidden">
              <div className="flex-1 p-3 overflow-auto">
                {isChangesLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="p-3 rounded-lg bg-[var(--glass-bg)]">
                      <div className="h-3 bg-[var(--border-color)] rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-[var(--border-color)] rounded w-1/2 mb-2"></div>
                      <div className="h-2 bg-[var(--border-color)] rounded w-2/3 mt-3"></div>
                    </div>
                  </div>
                ) : hasChanges ? (
                  <div className="space-y-3">
                    {changes.map((change, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--border-color)] space-y-2"
                      >
                        <div className="text-sm text-[var(--error)] line-through opacity-70">
                          {change.from}
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          <svg
                            className="w-4 h-4 text-[var(--success)] flex-shrink-0 mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="text-[var(--success)]">
                            {change.to}
                          </span>
                        </div>
                        {change.reason && (
                          <div className="pt-2 mt-2 border-t border-[var(--border-color)]">
                            <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed">
                              {change.reason}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`flex ${
                      outputText ? 'items-start' : 'items-center'
                    } justify-center h-full text-[var(--text-tertiary)] text-sm`}
                  >
                    {outputText ? t('noChanges') : t('changesAppear')}
                  </div>
                )}
              </div>
              {/* Status footer */}
              {(isChangesLoading || hasChanges) && (
                <div className="px-3 py-1.5 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
                  {isChangesLoading ? (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-blue)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--accent-blue)]"></span>
                      </span>
                      <span className="text-[10px] text-[var(--accent-blue)]">
                        {t('analyzing')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {changes.length}{' '}
                      {changes.length === 1 ? 'change' : 'changes'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
