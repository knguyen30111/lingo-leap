import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './appStore'

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      isEnabled: true,
      mode: 'translate',
      correctionLevel: 'fix',
      inputText: '',
      outputText: '',
      sourceLang: 'auto',
      targetLang: 'ja',
      isLoading: false,
      error: null,
      changes: [],
      isChangesLoading: false,
    })
  })

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useAppStore.getState()
      expect(state.isEnabled).toBe(true)
      expect(state.mode).toBe('translate')
      expect(state.correctionLevel).toBe('fix')
      expect(state.inputText).toBe('')
      expect(state.outputText).toBe('')
      expect(state.sourceLang).toBe('auto')
      expect(state.targetLang).toBe('ja')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.changes).toEqual([])
      expect(state.isChangesLoading).toBe(false)
    })
  })

  describe('setEnabled', () => {
    it('sets enabled to true', () => {
      useAppStore.getState().setEnabled(true)
      expect(useAppStore.getState().isEnabled).toBe(true)
    })

    it('sets enabled to false', () => {
      useAppStore.getState().setEnabled(false)
      expect(useAppStore.getState().isEnabled).toBe(false)
    })
  })

  describe('toggleEnabled', () => {
    it('toggles from true to false', () => {
      useAppStore.setState({ isEnabled: true })
      useAppStore.getState().toggleEnabled()
      expect(useAppStore.getState().isEnabled).toBe(false)
    })

    it('toggles from false to true', () => {
      useAppStore.setState({ isEnabled: false })
      useAppStore.getState().toggleEnabled()
      expect(useAppStore.getState().isEnabled).toBe(true)
    })
  })

  describe('setMode', () => {
    it('sets mode to translate', () => {
      useAppStore.getState().setMode('translate')
      expect(useAppStore.getState().mode).toBe('translate')
    })

    it('sets mode to correct', () => {
      useAppStore.getState().setMode('correct')
      expect(useAppStore.getState().mode).toBe('correct')
    })

    it('clears output, changes, and error when mode changes', () => {
      useAppStore.setState({
        outputText: 'old output',
        changes: [{ from: 'a', to: 'b', reason: 'test' }],
        error: 'old error',
      })
      useAppStore.getState().setMode('correct')
      expect(useAppStore.getState().outputText).toBe('')
      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().error).toBeNull()
    })
  })

  describe('setCorrectionLevel', () => {
    it('sets level to fix', () => {
      useAppStore.getState().setCorrectionLevel('fix')
      expect(useAppStore.getState().correctionLevel).toBe('fix')
    })

    it('sets level to improve', () => {
      useAppStore.getState().setCorrectionLevel('improve')
      expect(useAppStore.getState().correctionLevel).toBe('improve')
    })

    it('sets level to rewrite', () => {
      useAppStore.getState().setCorrectionLevel('rewrite')
      expect(useAppStore.getState().correctionLevel).toBe('rewrite')
    })

    it('clears output, changes, and error when level changes', () => {
      useAppStore.setState({
        outputText: 'old output',
        changes: [{ from: 'a', to: 'b', reason: 'test' }],
        error: 'old error',
      })
      useAppStore.getState().setCorrectionLevel('improve')
      expect(useAppStore.getState().outputText).toBe('')
      expect(useAppStore.getState().changes).toEqual([])
      expect(useAppStore.getState().error).toBeNull()
    })
  })

  describe('setInputText', () => {
    it('sets input text', () => {
      useAppStore.getState().setInputText('Hello world')
      expect(useAppStore.getState().inputText).toBe('Hello world')
    })

    it('handles empty string', () => {
      useAppStore.setState({ inputText: 'existing' })
      useAppStore.getState().setInputText('')
      expect(useAppStore.getState().inputText).toBe('')
    })
  })

  describe('setOutputText', () => {
    it('sets output text', () => {
      useAppStore.getState().setOutputText('Translated text')
      expect(useAppStore.getState().outputText).toBe('Translated text')
    })
  })

  describe('setSourceLang', () => {
    it('sets source language', () => {
      useAppStore.getState().setSourceLang('en')
      expect(useAppStore.getState().sourceLang).toBe('en')
    })

    it('sets to auto', () => {
      useAppStore.getState().setSourceLang('auto')
      expect(useAppStore.getState().sourceLang).toBe('auto')
    })
  })

  describe('setTargetLang', () => {
    it('sets target language', () => {
      useAppStore.getState().setTargetLang('ko')
      expect(useAppStore.getState().targetLang).toBe('ko')
    })
  })

  describe('setLoading', () => {
    it('sets loading to true', () => {
      useAppStore.getState().setLoading(true)
      expect(useAppStore.getState().isLoading).toBe(true)
    })

    it('sets loading to false', () => {
      useAppStore.setState({ isLoading: true })
      useAppStore.getState().setLoading(false)
      expect(useAppStore.getState().isLoading).toBe(false)
    })
  })

  describe('setError', () => {
    it('sets error message', () => {
      useAppStore.getState().setError('Something went wrong')
      expect(useAppStore.getState().error).toBe('Something went wrong')
    })

    it('clears error with null', () => {
      useAppStore.setState({ error: 'existing error' })
      useAppStore.getState().setError(null)
      expect(useAppStore.getState().error).toBeNull()
    })
  })

  describe('setChanges', () => {
    it('sets changes array', () => {
      const changes = [
        { from: 'teh', to: 'the', reason: 'typo' },
        { from: 'wrold', to: 'world', reason: 'spelling' },
      ]
      useAppStore.getState().setChanges(changes)
      expect(useAppStore.getState().changes).toEqual(changes)
    })

    it('clears changes with empty array', () => {
      useAppStore.setState({ changes: [{ from: 'a', to: 'b', reason: 'c' }] })
      useAppStore.getState().setChanges([])
      expect(useAppStore.getState().changes).toEqual([])
    })
  })

  describe('setChangesLoading', () => {
    it('sets changes loading to true', () => {
      useAppStore.getState().setChangesLoading(true)
      expect(useAppStore.getState().isChangesLoading).toBe(true)
    })

    it('sets changes loading to false', () => {
      useAppStore.setState({ isChangesLoading: true })
      useAppStore.getState().setChangesLoading(false)
      expect(useAppStore.getState().isChangesLoading).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useAppStore.setState({
        isEnabled: false,
        mode: 'correct',
        correctionLevel: 'rewrite',
        inputText: 'some input',
        outputText: 'some output',
        sourceLang: 'en',
        targetLang: 'ko',
        isLoading: true,
        error: 'some error',
        changes: [{ from: 'a', to: 'b', reason: 'c' }],
        isChangesLoading: true,
      })

      useAppStore.getState().reset()

      const state = useAppStore.getState()
      expect(state.isEnabled).toBe(true)
      expect(state.mode).toBe('translate')
      expect(state.correctionLevel).toBe('fix')
      expect(state.inputText).toBe('')
      expect(state.outputText).toBe('')
      expect(state.sourceLang).toBe('auto')
      expect(state.targetLang).toBe('ja')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.changes).toEqual([])
      expect(state.isChangesLoading).toBe(false)
    })
  })
})
