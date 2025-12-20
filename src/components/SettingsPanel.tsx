import { useState } from "react";
import { useSettingsStore, ThemeMode } from "../stores/settingsStore";
import { useOllama } from "../hooks/useOllama";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const {
    theme,
    setTheme,
    ollamaHost,
    setOllamaHost,
    translationModel,
    setTranslationModel,
    correctionModel,
    setCorrectionModel,
    defaultTargetLang,
    setDefaultTargetLang,
    explanationLang,
    setExplanationLang,
    useStreaming,
    setUseStreaming,
  } = useSettingsStore();

  const { models } = useOllama();
  const [localHost, setLocalHost] = useState(ollamaHost);

  const handleSaveHost = () => {
    setOllamaHost(localHost);
  };

  const themeOptions: {
    value: ThemeMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "light",
      label: "Light",
      icon: (
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
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
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
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ),
    },
    {
      value: "system",
      label: "System",
      icon: (
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
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 backdrop-blur flex items-center justify-center z-50">
      <div className="glass-modal w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Settings
          </h2>
          <button onClick={onClose} className="glass-button p-1">
            <svg
              className="w-5 h-5 text-[var(--text-secondary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Appearance
            </label>
            <div className="segmented-control w-full justify-center">
              {themeOptions.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`segmented-control-item flex items-center gap-1.5 ${
                    theme === value ? "active" : ""
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ollama Host */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Ollama Host
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localHost}
                onChange={(e) => setLocalHost(e.target.value)}
                className="input-glass flex-1"
              />
              <button onClick={handleSaveHost} className="btn-primary">
                Save
              </button>
            </div>
          </div>

          {/* Translation Model */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Translation Model
            </label>
            <select
              value={translationModel}
              onChange={(e) => setTranslationModel(e.target.value)}
              className="select-glass w-full"
            >
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
              {!models.find((m) => m.name === translationModel) && (
                <option value={translationModel}>{translationModel}</option>
              )}
            </select>
            <p className="text-xs text-[var(--text-tertiary)]">
              Recommended: aya:8b for multilingual translation
            </p>
          </div>

          {/* Correction Model */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Correction Model
            </label>
            <select
              value={correctionModel}
              onChange={(e) => setCorrectionModel(e.target.value)}
              className="select-glass w-full"
            >
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
              {!models.find((m) => m.name === correctionModel) && (
                <option value={correctionModel}>{correctionModel}</option>
              )}
            </select>
            <p className="text-xs text-[var(--text-tertiary)]">
              Recommended: qwen2.5:7b for grammar correction
            </p>
          </div>

          {/* Default Target Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Default Target Language
            </label>
            <select
              value={defaultTargetLang}
              onChange={(e) => setDefaultTargetLang(e.target.value)}
              className="select-glass w-full"
            >
              <option value="ja">Japanese</option>
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
              <option value="zh">Chinese</option>
              <option value="ko">Korean</option>
            </select>
          </div>

          {/* Explanation Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Explanation Language
            </label>
            <select
              value={explanationLang}
              onChange={(e) => setExplanationLang(e.target.value)}
              className="select-glass w-full"
            >
              <option value="auto">Match input language</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
              <option value="vi">Vietnamese</option>
              <option value="zh">Chinese</option>
              <option value="ko">Korean</option>
            </select>
            <p className="text-xs text-[var(--text-tertiary)]">
              Language for correction explanations
            </p>
          </div>

          {/* Streaming Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Streaming Output
              </label>
              <p className="text-xs text-[var(--text-tertiary)]">
                Show translation as it generates
              </p>
            </div>
            <button
              onClick={() => setUseStreaming(!useStreaming)}
              className={`toggle-switch ${useStreaming ? "active" : ""}`}
            >
              <span className="toggle-switch-knob" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
          <p className="text-xs text-center text-[var(--text-tertiary)]">
            Lingo Leap v0.1.0 - Offline AI Translation
          </p>
        </div>
      </div>
    </div>
  );
}
