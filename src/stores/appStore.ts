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
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setEnabled: (enabled) => set({ isEnabled: enabled }),
  toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),

  setMode: (mode) => set({ mode, outputText: '', changes: [], error: null }),
  setCorrectionLevel: (level) => set({ correctionLevel: level, outputText: '', changes: [], error: null }),

  setInputText: (text) => set({ inputText: text }),
  setOutputText: (text) => set({ outputText: text }),

  setSourceLang: (lang) => set({ sourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  setChanges: (changes) => set({ changes }),
  setChangesLoading: (loading) => set({ isChangesLoading: loading }),

  reset: () => set(initialState),
}))
