import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { useCorrection } from '../hooks/useCorrection';
import { LanguageSelector } from './LanguageSelector';
import { CorrectionTabs } from './CorrectionTabs';
import { EditorInputPanel } from './editor/editor-input-panel';
import { EditorOutputBody } from './editor/editor-output-body';
import { EditorOutputActions } from './editor/editor-output-actions';

const SKELETON_WIDTHS = ['w-full', 'w-5/6', 'w-4/6'];

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
  const { correct } = useCorrection();

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
          <EditorInputPanel
            className="min-h-0 flex flex-col glass-card overflow-hidden relative"
            value={inputText}
            onChange={setInputText}
            onClear={handleClearInput}
            onSubmit={handleRegenerate}
            placeholder={t('messages:placeholders.enterTextCorrect')}
            speechDisabled={isLoading}
          />

          {/* Right: Output + Changes (2/3 - Two Stacked Rectangles) */}
          <div className="col-span-2 min-h-0 grid grid-rows-[1fr_1fr] gap-4">
            {/* Top Right: Corrected Output */}
            <div className="min-h-0 flex flex-col glass-card overflow-hidden">
              <EditorOutputBody
                isLoading={isLoading}
                error={error}
                outputText={outputText}
                placeholder={t('messages:placeholders.correctedAppears')}
                skeletonWidths={SKELETON_WIDTHS}
              />
              <EditorOutputActions
                isLoading={isLoading}
                loadingLabel={t('processing')}
                outputText={outputText}
                onRegenerate={handleRegenerate}
                regenerateLabel={t('regenerate')}
                submitLabel={t('generate')}
                submitTitle="Generate (⌘+Enter)"
                submitDisabled={!inputText.trim()}
              />
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
