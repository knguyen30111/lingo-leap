import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MainWindow } from "./components/MainWindow";
import { SetupWizard } from "./components/SetupWizard";
import { useSettingsStore } from "./stores/settingsStore";
import { useTheme } from "./hooks/useTheme";
import { changeLanguage } from "./i18n";

function App() {
  const { t } = useTranslation("common");
  const { isSetupComplete, uiLanguage } = useSettingsStore();
  const [mounted, setMounted] = useState(false);

  // Initialize theme system
  useTheme();

  // Sync UI language from store to i18n
  useEffect(() => {
    changeLanguage(uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="text-[var(--text-tertiary)]">{t("loading")}</div>
      </div>
    );
  }

  // Onboarding is a one-time step. Live Ollama availability must not gate the
  // main window: losing the connection there would strand the user in the
  // wizard with no route back to Settings to correct the host. MainWindow
  // surfaces a connection banner with Retry instead.
  if (!isSetupComplete) {
    return <SetupWizard />;
  }

  return <MainWindow />;
}

export default App;
