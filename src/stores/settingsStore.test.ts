import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from './settingsStore'

// Mock i18n changeLanguage
vi.mock('../i18n', () => ({
  changeLanguage: vi.fn(),
}))

const STORAGE_KEY = 'tran-app-settings'

// A pristine snapshot keeps every rehydrate test independent. Zustand's
// default merge is a shallow spread, so leftovers from an earlier fixture
// would otherwise masquerade as preserved values.
const pristineState = useSettingsStore.getState()

// Every field the version-0 store persisted, with non-default values so any
// loss during migration is observable, plus an unknown nested sentinel.
const V0_STATE = {
  ollamaHost: 'http://192.168.1.50:11434',
  translationModel: 'gemma3:12b',
  correctionModel: 'llama3.1:8b',
  useSameModelForBoth: true,
  theme: 'dark',
  alwaysOnTop: true,
  autoHideAfterCopy: true,
  useStreaming: false,
  uiLanguage: 'vi',
  defaultTargetLang: 'ko',
  explanationLang: 'en',
  speechLang: 'ja',
  isSetupComplete: true,
  ollamaInstalled: true,
  modelsInstalled: true,
  legacyUnsupportedSettings: {
    retiredToggle: 'kept',
    nestedLegacy: { deep: [1, 2] },
  },
  unknownSentinel: { nested: ['keep'], object: { value: 54 } },
} as const

function writeRawStorage(state: unknown, version: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version }))
}

function readRawStorage() {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? null : (JSON.parse(raw) as { state: Record<string, unknown>; version: number })
}

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState(pristineState, true)
  })

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useSettingsStore.getState()
      expect(state.ollamaHost).toBe('http://localhost:11434')
      expect(state.translationModel).toBe('aya:8b')
      expect(state.correctionModel).toBe('qwen2.5:7b')
      expect(state.theme).toBe('system')
      expect(state.alwaysOnTop).toBe(false)
      expect(state.autoHideAfterCopy).toBe(false)
      expect(state.useStreaming).toBe(true)
      expect(state.uiLanguage).toBe('en')
      expect(state.defaultTargetLang).toBe('ja')
      expect(state.explanationLang).toBe('auto')
      expect(state.speechLang).toBe('en')
      expect(state.isSetupComplete).toBe(false)
      expect(state.ollamaInstalled).toBe(false)
      expect(state.modelsInstalled).toBe(false)
      expect(state.legacyUnsupportedSettings).toEqual({})
    })

    it('does not expose a same-model toggle in active state', () => {
      const state = useSettingsStore.getState()
      expect(state).not.toHaveProperty('useSameModelForBoth')
      expect(state).not.toHaveProperty('setUseSameModelForBoth')
    })
  })

  describe('Ollama settings', () => {
    it('setOllamaHost updates host', () => {
      useSettingsStore.getState().setOllamaHost('http://192.168.1.100:11434')
      expect(useSettingsStore.getState().ollamaHost).toBe('http://192.168.1.100:11434')
    })

    it('setTranslationModel updates model', () => {
      useSettingsStore.getState().setTranslationModel('gemma2:9b')
      expect(useSettingsStore.getState().translationModel).toBe('gemma2:9b')
    })

    it('setCorrectionModel updates model', () => {
      useSettingsStore.getState().setCorrectionModel('llama3.2:8b')
      expect(useSettingsStore.getState().correctionModel).toBe('llama3.2:8b')
    })

    it('keeps translation and correction models independent', () => {
      useSettingsStore.getState().setTranslationModel('gemma2:9b')
      expect(useSettingsStore.getState().correctionModel).toBe('qwen2.5:7b')
    })
  })

  describe('UI settings', () => {
    it('setTheme sets to light', () => {
      useSettingsStore.getState().setTheme('light')
      expect(useSettingsStore.getState().theme).toBe('light')
    })

    it('setTheme sets to dark', () => {
      useSettingsStore.getState().setTheme('dark')
      expect(useSettingsStore.getState().theme).toBe('dark')
    })

    it('setTheme sets to system', () => {
      useSettingsStore.setState({ theme: 'dark' })
      useSettingsStore.getState().setTheme('system')
      expect(useSettingsStore.getState().theme).toBe('system')
    })

    it('setAlwaysOnTop updates value', () => {
      useSettingsStore.getState().setAlwaysOnTop(true)
      expect(useSettingsStore.getState().alwaysOnTop).toBe(true)
    })

    it('setAutoHideAfterCopy updates value', () => {
      useSettingsStore.getState().setAutoHideAfterCopy(true)
      expect(useSettingsStore.getState().autoHideAfterCopy).toBe(true)
    })

    it('setUseStreaming updates value', () => {
      useSettingsStore.getState().setUseStreaming(false)
      expect(useSettingsStore.getState().useStreaming).toBe(false)
    })

    it('setUILanguage updates language and calls changeLanguage', async () => {
      const { changeLanguage } = await import('../i18n')
      useSettingsStore.getState().setUILanguage('ja')
      expect(useSettingsStore.getState().uiLanguage).toBe('ja')
      expect(changeLanguage).toHaveBeenCalledWith('ja')
    })

    it('setUILanguage supports all UI languages', async () => {
      const { changeLanguage } = await import('../i18n')

      useSettingsStore.getState().setUILanguage('vi')
      expect(useSettingsStore.getState().uiLanguage).toBe('vi')
      expect(changeLanguage).toHaveBeenCalledWith('vi')

      useSettingsStore.getState().setUILanguage('ko')
      expect(useSettingsStore.getState().uiLanguage).toBe('ko')
      expect(changeLanguage).toHaveBeenCalledWith('ko')
    })
  })

  describe('Language preferences', () => {
    it('setDefaultTargetLang updates language', () => {
      useSettingsStore.getState().setDefaultTargetLang('ko')
      expect(useSettingsStore.getState().defaultTargetLang).toBe('ko')
    })

    it('setExplanationLang updates language', () => {
      useSettingsStore.getState().setExplanationLang('en')
      expect(useSettingsStore.getState().explanationLang).toBe('en')
    })

    it('setExplanationLang sets to auto', () => {
      useSettingsStore.setState({ explanationLang: 'en' })
      useSettingsStore.getState().setExplanationLang('auto')
      expect(useSettingsStore.getState().explanationLang).toBe('auto')
    })

    it('setSpeechLang updates language', () => {
      useSettingsStore.getState().setSpeechLang('ja')
      expect(useSettingsStore.getState().speechLang).toBe('ja')
    })
  })

  describe('Setup state', () => {
    it('setSetupComplete updates value', () => {
      useSettingsStore.getState().setSetupComplete(true)
      expect(useSettingsStore.getState().isSetupComplete).toBe(true)
    })

    it('setOllamaInstalled updates value', () => {
      useSettingsStore.getState().setOllamaInstalled(true)
      expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    })

    it('setModelsInstalled updates value', () => {
      useSettingsStore.getState().setModelsInstalled(true)
      expect(useSettingsStore.getState().modelsInstalled).toBe(true)
    })
  })

  describe('persist middleware', () => {
    it('store has persist name', () => {
      expect(useSettingsStore.persist).toBeDefined()
      expect(useSettingsStore.persist.getOptions().name).toBe(STORAGE_KEY)
    })

    it('persists under storage version 1', () => {
      expect(useSettingsStore.persist.getOptions().version).toBe(1)
    })

    it('keeps the detected source language out of the persisted payload', () => {
      useSettingsStore.getState().setDefaultTargetLang('ko')
      useSettingsStore.getState().setExplanationLang('ja')

      const payload = localStorage.getItem(STORAGE_KEY)

      expect(payload).toContain('defaultTargetLang')
      expect(payload).not.toContain('latestDetectedSourceLang')
    })

    it('does not own a detected source language field', () => {
      expect(useSettingsStore.getState()).not.toHaveProperty('latestDetectedSourceLang')
      expect(useSettingsStore.getState()).not.toHaveProperty('setLatestDetectedSourceLang')
    })
  })

  describe('version 0 to version 1 migration', () => {
    it('moves an enabled same-model flag into legacy settings', async () => {
      writeRawStorage(V0_STATE, 0)

      await useSettingsStore.persist.rehydrate()

      const state = useSettingsStore.getState()
      expect(state).not.toHaveProperty('useSameModelForBoth')
      expect(state.legacyUnsupportedSettings.useSameModelForBoth).toBe(true)
    })

    it('preserves a disabled same-model flag as false rather than dropping it', async () => {
      writeRawStorage({ ...V0_STATE, useSameModelForBoth: false }, 0)

      await useSettingsStore.persist.rehydrate()

      expect(
        useSettingsStore.getState().legacyUnsupportedSettings.useSameModelForBoth
      ).toBe(false)
    })

    it('treats the active version 0 value as authoritative over a stale legacy value', async () => {
      writeRawStorage(
        {
          ...V0_STATE,
          useSameModelForBoth: false,
          legacyUnsupportedSettings: {
            useSameModelForBoth: true,
            retiredToggle: 'kept',
            nestedLegacy: { deep: [1, 2] },
          },
        },
        0
      )

      await useSettingsStore.persist.rehydrate()

      const legacy = useSettingsStore.getState().legacyUnsupportedSettings
      expect(legacy.useSameModelForBoth).toBe(false)
      expect(legacy.retiredToggle).toBe('kept')
      expect(legacy.nestedLegacy).toEqual({ deep: [1, 2] })
    })

    it('preserves every other persisted field and the unknown sentinel', async () => {
      writeRawStorage(V0_STATE, 0)

      await useSettingsStore.persist.rehydrate()

      const state = useSettingsStore.getState() as unknown as Record<string, unknown>
      const { useSameModelForBoth: _moved, legacyUnsupportedSettings: _legacy, ...unchanged } =
        V0_STATE
      for (const [key, value] of Object.entries(unchanged)) {
        expect(state[key]).toEqual(value)
      }
      expect(state.unknownSentinel).toEqual({ nested: ['keep'], object: { value: 54 } })
    })

    it('never rewrites the translation or correction model during migration', async () => {
      writeRawStorage(V0_STATE, 0)

      await useSettingsStore.persist.rehydrate()

      expect(useSettingsStore.getState().translationModel).toBe('gemma3:12b')
      expect(useSettingsStore.getState().correctionModel).toBe('llama3.1:8b')
      expect(readRawStorage()?.state.translationModel).toBe('gemma3:12b')
      expect(readRawStorage()?.state.correctionModel).toBe('llama3.1:8b')
    })

    it('writes back a version 1 payload without the active same-model field', async () => {
      writeRawStorage(V0_STATE, 0)

      await useSettingsStore.persist.rehydrate()

      const raw = readRawStorage()
      expect(raw?.version).toBe(1)
      expect(raw?.state).not.toHaveProperty('useSameModelForBoth')
      expect(raw?.state.legacyUnsupportedSettings).toEqual({
        useSameModelForBoth: true,
        retiredToggle: 'kept',
        nestedLegacy: { deep: [1, 2] },
      })
      expect(raw?.state.unknownSentinel).toEqual({ nested: ['keep'], object: { value: 54 } })
    })

    it('keeps the desktop preferences active rather than retiring them', async () => {
      writeRawStorage(V0_STATE, 0)

      await useSettingsStore.persist.rehydrate()

      const state = useSettingsStore.getState()
      expect(state.alwaysOnTop).toBe(true)
      expect(state.autoHideAfterCopy).toBe(true)
      expect(state.defaultTargetLang).toBe('ko')
      expect(state.legacyUnsupportedSettings).not.toHaveProperty('alwaysOnTop')
      expect(state.legacyUnsupportedSettings).not.toHaveProperty('autoHideAfterCopy')
    })
  })

  describe('same-version restart', () => {
    it('rehydrates version 1 storage without rerunning the legacy migration', async () => {
      const v1State = {
        ...V0_STATE,
        useSameModelForBoth: undefined,
        legacyUnsupportedSettings: { retiredToggle: 'kept' },
      }
      delete (v1State as Record<string, unknown>).useSameModelForBoth
      writeRawStorage(v1State, 1)
      const before = localStorage.getItem(STORAGE_KEY)

      await useSettingsStore.persist.rehydrate()

      expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
      expect(useSettingsStore.getState().legacyUnsupportedSettings).toEqual({
        retiredToggle: 'kept',
      })
      expect(useSettingsStore.getState().ollamaHost).toBe('http://192.168.1.50:11434')
    })
  })

  describe('fail-closed rehydration', () => {
    it('keeps defaults and raw storage when the payload is not valid JSON', async () => {
      localStorage.setItem(STORAGE_KEY, '{"state": {"theme": "dark"')

      await expect(useSettingsStore.persist.rehydrate()).resolves.toBeUndefined()

      expect(useSettingsStore.getState().theme).toBe('system')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{"state": {"theme": "dark"')
    })

    it('keeps defaults and raw storage when the persisted state is not an object', async () => {
      writeRawStorage('not-a-settings-object', 0)
      const before = localStorage.getItem(STORAGE_KEY)

      await useSettingsStore.persist.rehydrate()

      expect(useSettingsStore.getState().theme).toBe('system')
      expect(useSettingsStore.getState().ollamaHost).toBe('http://localhost:11434')
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    })

    it('refuses to down-migrate a future storage version', async () => {
      writeRawStorage({ ...V0_STATE, theme: 'light' }, 2)
      const before = localStorage.getItem(STORAGE_KEY)

      await useSettingsStore.persist.rehydrate()

      expect(useSettingsStore.getState().theme).toBe('system')
      expect(useSettingsStore.getState().ollamaHost).toBe('http://localhost:11434')
      expect(useSettingsStore.getState().legacyUnsupportedSettings).toEqual({})
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    })
  })
})
