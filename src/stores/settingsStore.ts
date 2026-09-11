import { create } from "zustand";
import { persist } from "zustand/middleware";
import { changeLanguage, type UILanguageCode } from "../i18n";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Current shape of the persisted `tran-app-settings` payload.
 *
 * Version 1 retired `useSameModelForBoth`: the shipped UI, locales, README,
 * and request builders all expose independent translation and correction
 * models, so the flag persisted a preference nothing could honour.
 */
export const SETTINGS_STORAGE_VERSION = 1;

/**
 * Preferences that are still stored but no longer drive any runtime effect.
 * They are kept so a later product decision can restore them, and so a
 * downgrade never silently loses a value the user once chose.
 */
export interface LegacyUnsupportedSettings {
  useSameModelForBoth?: boolean;
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Move retired settings out of active state without touching anything else.
 *
 * Unknown keys are carried through untouched: a payload written by a newer
 * build that a user downgraded from still holds settings this build cannot
 * name, and dropping them would destroy real preferences.
 */
export function migrateSettingsState(
  persistedState: unknown,
  persistedVersion: number
): unknown {
  if (persistedVersion > SETTINGS_STORAGE_VERSION) {
    // Fail closed. Guessing at a newer shape would overwrite the stored
    // payload with a lossy downgrade of settings this build cannot read.
    throw new Error(
      `Refusing to migrate tran-app-settings down from version ${persistedVersion}`
    );
  }
  if (!isPlainObject(persistedState)) {
    throw new Error("Refusing to migrate a malformed tran-app-settings payload");
  }

  const migrated = { ...persistedState };
  const storedLegacy = migrated.legacyUnsupportedSettings;
  const legacy: LegacyUnsupportedSettings = isPlainObject(storedLegacy)
    ? { ...storedLegacy }
    : {};

  if (typeof migrated.useSameModelForBoth === "boolean") {
    // The active field is what the running app last wrote, so it wins over a
    // legacy copy left behind by an earlier migration attempt.
    legacy.useSameModelForBoth = migrated.useSameModelForBoth;
  }
  delete migrated.useSameModelForBoth;

  migrated.legacyUnsupportedSettings = legacy;
  return migrated;
}

interface SettingsState {
  // Ollama
  ollamaHost: string;
  setOllamaHost: (host: string) => void;
  translationModel: string;
  setTranslationModel: (model: string) => void;
  correctionModel: string;
  setCorrectionModel: (model: string) => void;

  // UI
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (value: boolean) => void;
  autoHideAfterCopy: boolean;
  setAutoHideAfterCopy: (value: boolean) => void;
  useStreaming: boolean;
  setUseStreaming: (value: boolean) => void;
  uiLanguage: UILanguageCode;
  setUILanguage: (lang: UILanguageCode) => void;

  // Language preferences
  defaultTargetLang: string;
  setDefaultTargetLang: (lang: string) => void;
  explanationLang: string; // 'auto' = match input, or specific lang code
  setExplanationLang: (lang: string) => void;
  speechLang: string; // Language for speech recognition
  setSpeechLang: (lang: string) => void;

  // Setup
  isSetupComplete: boolean;
  setSetupComplete: (complete: boolean) => void;
  ollamaInstalled: boolean;
  setOllamaInstalled: (installed: boolean) => void;
  modelsInstalled: boolean;
  setModelsInstalled: (installed: boolean) => void;

  // Retired preferences, kept verbatim so nothing is lost across versions
  legacyUnsupportedSettings: LegacyUnsupportedSettings;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Ollama defaults
      ollamaHost: "http://localhost:11434",
      setOllamaHost: (host) => set({ ollamaHost: host }),
      translationModel: "aya:8b",
      setTranslationModel: (model) => set({ translationModel: model }),
      correctionModel: "qwen2.5:7b",
      setCorrectionModel: (model) => set({ correctionModel: model }),

      // UI
      theme: "system",
      setTheme: (theme) => set({ theme }),
      alwaysOnTop: false,
      setAlwaysOnTop: (value) => set({ alwaysOnTop: value }),
      autoHideAfterCopy: false,
      setAutoHideAfterCopy: (value) => set({ autoHideAfterCopy: value }),
      useStreaming: true,
      setUseStreaming: (value) => set({ useStreaming: value }),
      uiLanguage: "en",
      setUILanguage: (lang) => {
        changeLanguage(lang);
        set({ uiLanguage: lang });
      },

      // Language
      defaultTargetLang: "ja",
      setDefaultTargetLang: (lang) => set({ defaultTargetLang: lang }),
      explanationLang: "auto", // 'auto' = match input language
      setExplanationLang: (lang) => set({ explanationLang: lang }),
      speechLang: "en", // Default speech recognition language
      setSpeechLang: (lang) => set({ speechLang: lang }),

      // Setup
      isSetupComplete: false,
      setSetupComplete: (complete) => set({ isSetupComplete: complete }),
      ollamaInstalled: false,
      setOllamaInstalled: (installed) => set({ ollamaInstalled: installed }),
      modelsInstalled: false,
      setModelsInstalled: (installed) => set({ modelsInstalled: installed }),

      // Retired
      legacyUnsupportedSettings: {},
    }),
    {
      name: "tran-app-settings",
      version: SETTINGS_STORAGE_VERSION,
      migrate: migrateSettingsState,
    }
  )
);
