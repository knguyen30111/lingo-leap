import { useState, useEffect, useCallback } from 'react'
import { ollamaClient } from '../lib/ollama-client'
import { OllamaModelInfo } from '../types'
import { useSettingsStore } from '../stores/settingsStore'

interface OllamaState {
  isConnected: boolean
  isChecking: boolean
  models: OllamaModelInfo[]
  error: string | null
}

export function useOllama() {
  const { ollamaHost, setOllamaInstalled, setModelsInstalled, translationModel, correctionModel } = useSettingsStore()

  const [state, setState] = useState<OllamaState>({
    isConnected: false,
    isChecking: true,
    models: [],
    error: null,
  })

  const checkConnection = useCallback(async () => {
    setState(prev => ({ ...prev, isChecking: true, error: null }))

    try {
      ollamaClient.setBaseUrl(ollamaHost)
      const isHealthy = await ollamaClient.checkHealth()

      if (isHealthy) {
        const models = await ollamaClient.listModels()
        setState({
          isConnected: true,
          isChecking: false,
          models,
          error: null,
        })
        setOllamaInstalled(true)

        // Check if required models are installed using exact name matching
        const modelNames = models.map(m => m.name)
        const hasTranslation = modelNames.includes(translationModel)
        const hasCorrection = modelNames.includes(correctionModel)
        setModelsInstalled(hasTranslation && hasCorrection)
      } else {
        setState({
          isConnected: false,
          isChecking: false,
          models: [],
          error: 'Cannot connect to Ollama. Make sure it is running.',
        })
        setOllamaInstalled(false)
      }
    } catch (err) {
      setState({
        isConnected: false,
        isChecking: false,
        models: [],
        error: err instanceof Error ? err.message : 'Failed to connect to Ollama',
      })
      setOllamaInstalled(false)
    }
  }, [ollamaHost, setOllamaInstalled, setModelsInstalled, translationModel, correctionModel])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  const hasModel = useCallback((modelName: string): boolean => {
    return state.models.some(m => m.name === modelName)
  }, [state.models])

  return {
    ...state,
    checkConnection,
    hasModel,
  }
}
