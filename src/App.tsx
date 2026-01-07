import { useEffect, useState, useCallback } from "react";
import { MainWindow } from "./components/MainWindow";
import { useSettingsStore } from "./stores/settingsStore";
import { useOllama } from "./hooks/useOllama";
import { useTheme } from "./hooks/useTheme";

// Copy button component for terminal commands
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 rounded hover:bg-[var(--hover-overlay)] transition-colors"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <svg
          className="w-3.5 h-3.5 text-[var(--success)]"
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
      ) : (
        <svg
          className="w-3.5 h-3.5 text-[var(--text-tertiary)]"
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
      )}
    </button>
  );
}

// Command line component with copy functionality
function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex items-center justify-between bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] px-3 py-2 mt-1">
      <code className="text-xs text-[var(--text-primary)] font-mono">
        {command}
      </code>
      <CopyButton text={command} />
    </div>
  );
}

// Model status indicator
function ModelStatus({
  name,
  isInstalled,
  isChecking,
}: {
  name: string;
  isInstalled: boolean;
  isChecking: boolean;
}) {
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
        {isChecking ? "Checking..." : isInstalled ? "Installed" : "Not found"}
      </span>
    </div>
  );
}

function SetupWizard() {
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
          Welcome to Lingo Leap
        </h1>
        <p className="text-[var(--text-secondary)] mb-6">
          Offline translation powered by local AI
        </p>

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
                  ? "Checking Ollama..."
                  : isConnected
                  ? "Ollama Connected"
                  : "Ollama Not Found"}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                {isChecking
                  ? "Please wait..."
                  : isConnected
                  ? `${models.length} model${models.length !== 1 ? "s" : ""} available`
                  : "Install Ollama to continue"}
              </div>
            </div>
          </div>

          {/* Model Status - Show when Ollama is connected */}
          {isConnected && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Required Models
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
                  Missing models - see instructions below to install
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
                  Download Ollama
                </a>
                <button
                  onClick={handleRetry}
                  className="glass-button px-4 py-2 text-sm font-medium"
                >
                  Retry
                </button>
              </>
            )}

            {isConnected && (
              <button
                onClick={() => setSetupComplete(true)}
                className="btn-primary flex-1"
                disabled={!allModelsInstalled}
              >
                {allModelsInstalled ? "Get Started" : "Install Models First"}
              </button>
            )}

            {isConnected && !allModelsInstalled && (
              <button
                onClick={handleRetry}
                className="glass-button px-4 py-2 text-sm font-medium"
              >
                Refresh
              </button>
            )}
          </div>

          {/* Skip link */}
          <button
            onClick={handleSkip}
            className="w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Skip setup
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-6 pt-6 border-t border-[var(--border-color)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
            Setup Instructions
          </h3>
          <ol className="text-sm text-[var(--text-secondary)] space-y-3">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold">
                1
              </span>
              <div className="flex-1">
                <span>
                  Download and install Ollama from{" "}
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
                <span>Download translation model (~5GB):</span>
                <CommandLine command={`ollama pull ${translationModel}`} />
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--accent-blue)] text-white text-xs font-bold">
                3
              </span>
              <div className="flex-1">
                <span>Download grammar model (~3GB):</span>
                <CommandLine command={`ollama pull ${correctionModel}`} />
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { isSetupComplete, ollamaInstalled } = useSettingsStore();
  const [mounted, setMounted] = useState(false);

  // Initialize theme system
  useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="text-[var(--text-tertiary)]">Loading...</div>
      </div>
    );
  }

  // Show setup wizard if setup not complete OR Ollama not installed
  if (!isSetupComplete || !ollamaInstalled) {
    return <SetupWizard />;
  }

  return <MainWindow />;
}

export default App;
