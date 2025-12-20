import { useEffect, useState } from "react";
import { MainWindow } from "./components/MainWindow";
import { useSettingsStore } from "./stores/settingsStore";
import { useOllama } from "./hooks/useOllama";
import { useTheme } from "./hooks/useTheme";

function SetupWizard() {
  const { isConnected, isChecking, checkConnection } = useOllama();
  const { setSetupComplete } = useSettingsStore();

  const handleSkip = () => {
    setSetupComplete(true);
  };

  const handleRetry = () => {
    checkConnection();
  };

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
            <div>
              <div className="font-medium text-[var(--text-primary)]">
                {isChecking
                  ? "Checking Ollama..."
                  : isConnected
                  ? "Ollama Connected"
                  : "Ollama Not Found"}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                {isConnected
                  ? "Ready to translate"
                  : "Install Ollama from ollama.com"}
              </div>
            </div>
          </div>

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
              >
                Get Started
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
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
            Quick Setup:
          </h3>
          <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
            <li>Install Ollama from ollama.com</li>
            <li>
              Run:{" "}
              <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] text-xs">
                ollama pull aya:8b
              </code>
            </li>
            <li>
              Run:{" "}
              <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] text-xs">
                ollama pull qwen3:4b
              </code>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { isSetupComplete } = useSettingsStore();
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

  if (!isSetupComplete) {
    return <SetupWizard />;
  }

  return <MainWindow />;
}

export default App;
