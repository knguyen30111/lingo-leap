import { useEffect, useState } from "react";
import { MainWindow } from "./components/MainWindow";
import { SetupWizard } from "./components/SetupWizard";
import { useSettingsStore } from "./stores/settingsStore";
import { useTheme } from "./hooks/useTheme";

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
