import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore, DEFAULT_OLLAMA_HOST } from "../stores/settingsStore";
import { useOllama } from "../hooks/useOllama";
import { CopyButton } from "./CopyButton";

/**
 * Command line display with copy functionality.
 */
function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex items-center justify-between bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] px-3 py-2 mt-1">
      <code className="text-xs text-[var(--text-primary)] font-mono">
        {command}
      </code>
      <CopyButton text={command} className="ml-2" />
    </div>
  );
}

/**
 * Model installation status indicator.
 */
function ModelStatus({
  name,
  isInstalled,
  isChecking,
}: {
  name: string;
  isInstalled: boolean;
  isChecking: boolean;
}) {
  const { t } = useTranslation("setup");

  return (
    <div className="flex items-center gap-2 py-1">
      <div
        className={`status-dot ${
          isChecking
            ? "warning animate-pulse"
            : isInstalled
            ? "success"
            : "error"
        }`}
      />
      <span className="text-sm text-[var(--text-primary)]">{name}</span>
      <span className="text-xs text-[var(--text-tertiary)] ml-auto">
        {isChecking
          ? t("models.checking")
          : isInstalled
          ? t("models.installed")
          : t("models.notFound")}
      </span>
    </div>
  );
}

/**
 * The trimmed host, or null when it is not an endpoint the client could use.
 *
 * A host that is not an absolute http or https URL can never connect, so
 * persisting it would replace one unreachable endpoint with another.
 */
export function normalizeOllamaHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

/**
 * Setup wizard shown when Ollama is not available or models are missing.
 * Guides user through installing Ollama and required models.
 *
 * The host field is part of the wizard rather than only of the settings panel:
 * the wizard is what the application shows whenever the configured endpoint
 * does not answer, so a persisted typo would otherwise leave the user with no
 * screen that can correct it.
 */
export function SetupWizard() {
  const { t } = useTranslation("setup");
  const { isConnected, isChecking, checkConnection, models, hasModel } =
    useOllama();
  const {
    setSetupComplete,
    translationModel,
    correctionModel,
    ollamaHost,
    setOllamaHost,
  } = useSettingsStore();

  // Null means "nothing typed yet", so the field keeps showing whatever the
  // store holds — including a host changed from somewhere else — until the
  // user actually edits it.
  const [hostDraft, setHostDraft] = useState<string | null>(null);
  const [hostRejected, setHostRejected] = useState(false);
  const hostValue = hostDraft ?? ollamaHost;

  const handleSaveHost = () => {
    const normalized = normalizeOllamaHost(hostValue);
    if (normalized === null) {
      setHostRejected(true);
      return;
    }
    setHostRejected(false);
    if (normalized === ollamaHost) {
      checkConnection();
      return;
    }
    setHostDraft(null);
    setOllamaHost(normalized);
  };

  const handleRestoreDefaultHost = () => {
    setHostRejected(false);
    setHostDraft(null);
    setOllamaHost(DEFAULT_OLLAMA_HOST);
  };

  // Check if required models are installed
  const hasTranslationModel = hasModel(translationModel);
  const hasCorrectionModel = hasModel(correctionModel);
  const allModelsInstalled = hasTranslationModel && hasCorrectionModel;

  const handleSkip = () => {
    setSetupComplete(true);
  };

  const handleRetry = () => {
    checkConnection();
  };

  // Get model base names for display
  const translationModelName = translationModel.split(":")[0];
  const correctionModelName = correctionModel.split(":")[0];

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--bg-primary)] p-8">
      <div className="glass-modal max-w-md w-full p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          {t("welcome")}
        </h1>
        <p className="text-[var(--text-secondary)] mb-6">{t("subtitle")}</p>

        <div className="space-y-4">
          {/* Ollama Status */}
          <div className="flex items-center gap-3 p-4 glass-card">
            <div
              className={`status-dot ${
                isChecking
                  ? "warning animate-pulse"
                  : isConnected
                  ? "success"
                  : "error"
              }`}
            />
            <div className="flex-1">
              <div className="font-medium text-[var(--text-primary)]">
                {isChecking
                  ? t("ollama.checking")
                  : isConnected
                  ? t("ollama.connected")
                  : t("ollama.notFound")}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                {isChecking
                  ? t("ollama.pleaseWait")
                  : isConnected
                  ? `${models.length} model${models.length !== 1 ? "s" : ""} available`
                  : t("ollama.installToContinue")}
              </div>
            </div>
          </div>

          {/* Ollama host - always editable, so an unreachable saved endpoint
              can be corrected from the only screen the app will show. */}
          <div className="glass-card p-4 space-y-2">
            <label
              htmlFor="ollama-host"
              className="block text-sm font-medium text-[var(--text-primary)]"
            >
              {t("ollama.hostLabel")}
            </label>
            <input
              id="ollama-host"
              type="text"
              value={hostValue}
              onChange={(e) => setHostDraft(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="input-glass w-full text-sm font-mono"
            />
            <p className="text-xs text-[var(--text-tertiary)]">
              {t("ollama.hostHint")}
            </p>
            {hostRejected && (
              <p className="text-xs text-[var(--error)]">
                {t("ollama.hostInvalid")}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveHost}
                className="glass-button px-4 py-2 text-sm font-medium"
              >
                {t("buttons.saveHost")}
              </button>
              <button
                onClick={handleRestoreDefaultHost}
                className="glass-button px-4 py-2 text-sm font-medium"
              >
                {t("buttons.restoreDefaultHost")}
              </button>
            </div>
          </div>

          {/* Model Status - Show when Ollama is connected */}
          {isConnected && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                {t("models.title")}
              </h3>
              <div className="space-y-1">
                <ModelStatus
                  name={`${translationModelName} (Translation)`}
                  isInstalled={hasTranslationModel}
                  isChecking={isChecking}
                />
                <ModelStatus
                  name={`${correctionModelName} (Grammar)`}
                  isInstalled={hasCorrectionModel}
                  isChecking={isChecking}
                />
              </div>
              {!allModelsInstalled && (
                <p className="text-xs text-[var(--warning)] mt-3">
                  {t("models.missing")}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {!isConnected && !isChecking && (
              <>
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary flex-1 text-center"
                >
                  {t("buttons.downloadOllama")}
                </a>
                <button
                  onClick={handleRetry}
                  className="glass-button px-4 py-2 text-sm font-medium"
                >
                  {t("common:retry")}
                </button>
              </>
            )}

            {isConnected && (
              <button
                onClick={() => setSetupComplete(true)}
                className="btn-primary flex-1"
                disabled={!allModelsInstalled}
              >
                {allModelsInstalled
                  ? t("buttons.getStarted")
                  : t("buttons.installModelsFirst")}
              </button>
            )}

            {isConnected && !allModelsInstalled && (
              <button
                onClick={handleRetry}
                className="glass-button px-4 py-2 text-sm font-medium"
              >
                {t("common:refresh")}
              </button>
            )}
          </div>

          {/* Skip link */}
          <button
            onClick={handleSkip}
            className="w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {t("buttons.skipSetup")}
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
            {t("instructions.title")}
          </h3>
          <ol className="text-sm text-[var(--text-secondary)] space-y-3">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold">
                1
              </span>
              <div className="flex-1">
                <span>
                  {t("instructions.step1")}{" "}
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent-blue)] hover:underline"
                  >
                    ollama.com
                  </a>
                </span>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold">
                2
              </span>
              <div className="flex-1">
                <span>{t("instructions.downloadTranslation")}</span>
                <CommandLine command={`ollama pull ${translationModel}`} />
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold">
                3
              </span>
              <div className="flex-1">
                <span>{t("instructions.downloadGrammar")}</span>
                <CommandLine command={`ollama pull ${correctionModel}`} />
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
