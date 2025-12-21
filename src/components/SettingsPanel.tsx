import { useState } from "react";
import { useSettingsStore, ThemeMode } from "../stores/settingsStore";
import { useOllama } from "../hooks/useOllama";
import { useAudioDevices } from "../hooks/useAudioDevices";

interface SettingsPanelProps {
  onClose: () => void;
}

// Section component for grouped settings
function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <span className="settings-section-icon">{icon}</span>
        <span className="settings-section-title">{title}</span>
      </div>
      <div className="settings-section-content">{children}</div>
    </div>
  );
}

// Setting row component
function SettingRow({
  label,
  description,
  children,
  inline = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={`setting-row ${inline ? "setting-row-inline" : ""}`}>
      <div className="setting-row-label">
        <span className="setting-label-text">{label}</span>
        {description && (
          <span className="setting-label-desc">{description}</span>
        )}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
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
    speechLang,
    setSpeechLang,
    useStreaming,
    setUseStreaming,
  } = useSettingsStore();

  const { models } = useOllama();
  const [localHost, setLocalHost] = useState(ollamaHost);
  const {
    devices,
    selectedDeviceId,
    selectDevice,
    isLoading: isLoadingDevices,
  } = useAudioDevices();

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
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "Auto",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  const languages = [
    { code: "en", label: "English" },
    { code: "ja", label: "Japanese" },
    { code: "vi", label: "Vietnamese" },
    { code: "zh", label: "Chinese" },
    { code: "ko", label: "Korean" },
  ];

  return (
    <div className="fixed inset-0 backdrop-blur flex items-center justify-center z-50">
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button onClick={onClose} className="settings-close-btn">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="settings-content">
          {/* Appearance Section */}
          <SettingsSection
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            }
            title="Appearance"
          >
            <div className="theme-selector">
              {themeOptions.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`theme-option ${theme === value ? "active" : ""}`}
                >
                  <span className="theme-option-icon">{icon}</span>
                  <span className="theme-option-label">{label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>

          {/* AI & Models Section */}
          <SettingsSection
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            title="AI Engine"
          >
            <SettingRow label="Ollama Host">
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={localHost}
                  onChange={(e) => setLocalHost(e.target.value)}
                  className="input-glass flex-1 text-sm"
                  placeholder="http://localhost:11434"
                />
                <button
                  onClick={handleSaveHost}
                  className="btn-primary text-xs px-3"
                >
                  Save
                </button>
              </div>
            </SettingRow>

            <SettingRow
              label="Translation Model"
              description="Recommended: aya:8b"
            >
              <select
                value={translationModel}
                onChange={(e) => setTranslationModel(e.target.value)}
                className="select-glass w-full text-sm"
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
            </SettingRow>

            <SettingRow
              label="Correction Model"
              description="Recommended: qwen2.5:7b"
            >
              <select
                value={correctionModel}
                onChange={(e) => setCorrectionModel(e.target.value)}
                className="select-glass w-full text-sm"
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
            </SettingRow>

            <SettingRow
              label="Streaming Output"
              description="Show translation as it generates"
              inline
            >
              <button
                onClick={() => setUseStreaming(!useStreaming)}
                className={`toggle-switch ${useStreaming ? "active" : ""}`}
              >
                <span className="toggle-switch-knob" />
              </button>
            </SettingRow>
          </SettingsSection>

          {/* Languages Section */}
          <SettingsSection
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            }
            title="Languages"
          >
            <SettingRow label="Default Target">
              <select
                value={defaultTargetLang}
                onChange={(e) => setDefaultTargetLang(e.target.value)}
                className="select-glass w-full text-sm"
              >
                {languages.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label="Explanation Language"
              description="For grammar corrections"
            >
              <select
                value={explanationLang}
                onChange={(e) => setExplanationLang(e.target.value)}
                className="select-glass w-full text-sm"
              >
                <option value="auto">Match input</option>
                {languages.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              label="Speech Recognition"
              description="Voice input language"
            >
              <select
                value={speechLang}
                onChange={(e) => setSpeechLang(e.target.value)}
                className="select-glass w-full text-sm"
              >
                {languages.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </SettingRow>
          </SettingsSection>

          {/* Input Section */}
          <SettingsSection
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            }
            title="Input"
          >
            <SettingRow label="Microphone" description="Voice input device">
              <select
                value={selectedDeviceId || ""}
                onChange={(e) => selectDevice(e.target.value)}
                disabled={isLoadingDevices || devices.length === 0}
                className="select-glass w-full text-sm"
              >
                {devices.length === 0 ? (
                  <option value="">No microphones found</option>
                ) : (
                  devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                      {device.isDefault ? " (Default)" : ""}
                    </option>
                  ))
                )}
              </select>
            </SettingRow>
          </SettingsSection>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <div className="settings-footer-content">
            <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Lingo Leap v0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
