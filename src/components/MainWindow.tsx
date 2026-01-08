import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/appStore";
import { useOllama } from "../hooks/useOllama";
import { ModeSelector } from "./ModeSelector";
import { TranslationView } from "./TranslationView";
import { CorrectionView } from "./CorrectionView";
import { SettingsPanel } from "./SettingsPanel";

export function MainWindow() {
  const { t } = useTranslation(["messages", "common"]);
  const { mode, isEnabled } = useAppStore();
  const { isConnected, isChecking, checkConnection } = useOllama();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-primary)]">
      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Header - Liquid Glass */}
      <header className="glass-header flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div
            className={`status-dot ${
              isEnabled
                ? isConnected
                  ? "success"
                  : isChecking
                  ? "warning animate-pulse"
                  : "error"
                : "inactive"
            }`}
            title={
              isEnabled
                ? isConnected
                  ? t("status.connected")
                  : isChecking
                  ? t("status.checking")
                  : t("status.notConnected")
                : t("status.disabled")
            }
          />
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("common:appName")}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <ModeSelector />

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="glass-button p-1.5"
            title={t("settings:title")}
          >
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden bg-[var(--bg-secondary)]">
        {!isConnected && !isChecking && (
          <div className="p-3 bg-[var(--warning)]/10 border-b border-[var(--warning)]/20 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--warning)]">
              {t("errors.ollamaConnection")}
            </p>
            <button
              onClick={checkConnection}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] bg-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning)]/30 transition-colors"
            >
              {t("common:retry")}
            </button>
          </div>
        )}
        {isChecking && (
          <div className="p-3 bg-[var(--accent)]/10 border-b border-[var(--accent)]/20 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--accent)]">
              {t("status.checking")}
            </p>
          </div>
        )}

        {mode === "translate" ? <TranslationView /> : <CorrectionView />}
      </main>

    </div>
  );
}
