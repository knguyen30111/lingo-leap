import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from './settingsStore'

// Mock i18n changeLanguage
vi.mock('../i18n', () => ({
  changeLanguage: vi.fn(),
}))

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset store to default values
    useSettingsStore.setState({
      ollamaHost: 'http://localhost:11434',
      translationModel: 'aya:8b',
      correctionModel: 'qwen2.5:7b',
      useSameModelForBoth: false,
      theme: 'system',
      alwaysOnTop: false,
      autoHideAfterCopy: false,
      useStreaming: true,
      uiLanguage: 'en',
      defaultTargetLang: 'ja',
      explanationLang: 'auto',
      speechLang: 'en',
      isSetupComplete: false,
      ollamaInstalled: false,
      modelsInstalled: false,
    })
  })

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useSettingsStore.getState()
      expect(state.ollamaHost).toBe('http://localhost:11434')
      expect(state.translationModel).toBe('aya:8b')
      expect(state.correctionModel).toBe('qwen2.5:7b')
      expect(state.useSameModelForBoth).toBe(false)
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

    it('setUseSameModelForBoth updates value', () => {
      useSettingsStore.getState().setUseSameModelForBoth(true)
      expect(useSettingsStore.getState().useSameModelForBoth).toBe(true)
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
      // The store uses persist middleware with name 'tran-app-settings'
      // We can verify the store is wrapped with persist by checking its API
      expect(useSettingsStore.persist).toBeDefined()
      expect(useSettingsStore.persist.getOptions().name).toBe('tran-app-settings')
    })
  })
})
