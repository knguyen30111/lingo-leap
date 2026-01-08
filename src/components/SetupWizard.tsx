import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";
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
 * Setup wizard shown when Ollama is not available or models are missing.
 * Guides user through installing Ollama and required models.
 */
export function SetupWizard() {
  const { t } = useTranslation("setup");
  const { isConnected, isChecking, checkConnection, models, hasModel } =
    useOllama();
  const { setSetupComplete, translationModel, correctionModel } =
    useSettingsStore();

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
