import { create } from "zustand";
import { persist } from "zustand/middleware";
import { changeLanguage, type UILanguageCode } from "../i18n";
import type { ReasoningMode } from "../types";

export type ThemeMode = "light" | "dark" | "system";

interface SettingsState {
  // Ollama
  ollamaHost: string;
  setOllamaHost: (host: string) => void;
  translationModel: string;
  setTranslationModel: (model: string) => void;
  correctionModel: string;
  setCorrectionModel: (model: string) => void;
  useSameModelForBoth: boolean;
  setUseSameModelForBoth: (value: boolean) => void;

  // UI
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (value: boolean) => void;
  autoHideAfterCopy: boolean;
  setAutoHideAfterCopy: (value: boolean) => void;
  useStreaming: boolean;
  setUseStreaming: (value: boolean) => void;
  reasoningMode: ReasoningMode;
  setReasoningMode: (mode: ReasoningMode) => void;
  reasoningModel: string;
  setReasoningModel: (model: string) => void;
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
      useSameModelForBoth: false,
      setUseSameModelForBoth: (value) => set({ useSameModelForBoth: value }),

      // UI
      theme: "system",
      setTheme: (theme) => set({ theme }),
      alwaysOnTop: false,
      setAlwaysOnTop: (value) => set({ alwaysOnTop: value }),
      autoHideAfterCopy: false,
      setAutoHideAfterCopy: (value) => set({ autoHideAfterCopy: value }),
      useStreaming: true,
      setUseStreaming: (value) => set({ useStreaming: value }),
      // Instant by default: the shipped correction model cannot think, and a
      // reasoning pass costs noticeably more time when one can.
      reasoningMode: "instant",
      setReasoningMode: (mode) => set({ reasoningMode: mode }),
      // Thinking runs on its own model. A hybrid reasoner deliberates whether or
      // not thinking is requested - qwen3:4b took 63s for an "instant" rewrite
      // that qwen2.5:7b returned in 6s - so sharing one model would mean picking
      // a reasoner destroys the instant path.
      reasoningModel: "qwen3:4b",
      setReasoningModel: (model) => set({ reasoningModel: model }),
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
    }),
    {
      name: "tran-app-settings",
    }
  )
);
