import { create } from 'zustand'

export type Mode = 'translate' | 'correct'
export type CorrectionLevel = 'fix' | 'improve' | 'rewrite'

interface AppState {
  // Global toggle
  isEnabled: boolean
  setEnabled: (enabled: boolean) => void
  toggleEnabled: () => void

  // Mode (auto-detected or manual)
  mode: Mode
  setMode: (mode: Mode) => void

  // Correction level
  correctionLevel: CorrectionLevel
  setCorrectionLevel: (level: CorrectionLevel) => void

  // Input/Output
  inputText: string
  setInputText: (text: string) => void
  outputText: string
  setOutputText: (text: string) => void

  // Language
  sourceLang: string
  setSourceLang: (lang: string) => void
  targetLang: string
  setTargetLang: (lang: string) => void

  // Status
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void

  // Timing for the current and last correction run
  runStartedAt: number | null
  setRunStartedAt: (t: number | null) => void
  lastRunMs: number | null
  setLastRunMs: (ms: number | null) => void

  // Reasoning trace (populated only when a thinking run is requested)
  thinkingText: string
  setThinkingText: (text: string) => void
  isThinking: boolean
  setThinking: (value: boolean) => void

  // Changes (for correction mode)
  changes: Array<{ from: string; to: string; reason: string }>
  setChanges: (changes: Array<{ from: string; to: string; reason: string }>) => void
  isChangesLoading: boolean
  setChangesLoading: (loading: boolean) => void

  // Reset
  reset: () => void
}

const initialState = {
  isEnabled: true,
  mode: 'translate' as Mode,
  correctionLevel: 'fix' as CorrectionLevel,
  inputText: '',
  outputText: '',
  sourceLang: 'auto',
  targetLang: 'ja',
  isLoading: false,
  error: null,
  changes: [],
  isChangesLoading: false,
  thinkingText: '',
  isThinking: false,
  runStartedAt: null,
  lastRunMs: null,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setEnabled: (enabled) => set({ isEnabled: enabled }),
  toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),

  // A duration belongs to the result that produced it, so clearing the result
  // must clear the timing with it.
  setMode: (mode) =>
    set({ mode, outputText: '', changes: [], error: null, thinkingText: '', lastRunMs: null, runStartedAt: null }),
  setCorrectionLevel: (level) =>
    set({ correctionLevel: level, outputText: '', changes: [], error: null, thinkingText: '', lastRunMs: null }),

  setInputText: (text) => set({ inputText: text }),
  setOutputText: (text) => set({ outputText: text }),

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  setRunStartedAt: (t) => set({ runStartedAt: t }),
  setLastRunMs: (ms) => set({ lastRunMs: ms }),

  setThinkingText: (text) => set({ thinkingText: text }),
  setThinking: (value) => set({ isThinking: value }),

  setChanges: (changes) => set({ changes }),
  setChangesLoading: (loading) => set({ isChangesLoading: loading }),

  reset: () => set(initialState),
}))
