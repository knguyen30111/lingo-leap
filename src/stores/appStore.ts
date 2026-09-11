import { create } from 'zustand'
import type { Change, CorrectionLevel } from '../types'

export type Mode = 'translate' | 'correct'

// Re-exported for the existing `../stores/appStore` importers; the single
// declaration lives in `src/types`.
export type { CorrectionLevel }

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
  // The language the detector resolved for the latest published result. It
  // describes an answer, never a request, so it is display state only.
  latestDetectedSourceLang: string | null
  setLatestDetectedSourceLang: (lang: string | null) => void
  targetLang: string
  setTargetLang: (lang: string) => void

  // Status
  isLoading: boolean
  setLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void

  // Changes (for correction mode)
  changes: Change[]
  setChanges: (changes: Change[]) => void
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
  latestDetectedSourceLang: null,
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

  setMode: (mode) => set({ mode, outputText: '', changes: [], error: null, latestDetectedSourceLang: null }),
  setCorrectionLevel: (level) => set({ correctionLevel: level, outputText: '', changes: [], error: null }),

  // A detected language belongs to the text it was detected from.
  setInputText: (text) => set({ inputText: text, latestDetectedSourceLang: null }),
  setOutputText: (text) => set({ outputText: text }),

  setSourceLang: (lang) => set({ sourceLang: lang, latestDetectedSourceLang: null }),
  setLatestDetectedSourceLang: (lang) => set({ latestDetectedSourceLang: lang }),
  setTargetLang: (lang) => set({ targetLang: lang }),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  setChanges: (changes) => set({ changes }),
  setChangesLoading: (loading) => set({ isChangesLoading: loading }),

  reset: () => set(initialState),
}))
