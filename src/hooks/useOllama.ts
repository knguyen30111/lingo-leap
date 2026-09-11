import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { OllamaClient } from '../lib/ollama-client'
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

  // One provider per configured host; it never changes endpoint mid-flight.
  const provider = useMemo(() => new OllamaClient(ollamaHost), [ollamaHost])
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const checkConnection = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestIdRef.current === requestId && !controller.signal.aborted

    setState(prev => ({ ...prev, isChecking: true, error: null }))

    try {
      const isHealthy = await provider.checkHealth(controller.signal)
      if (!isCurrent()) return

      if (isHealthy) {
        const models = await provider.listModels(controller.signal)
        if (!isCurrent()) return

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
      if (!isCurrent()) return
      setState({
        isConnected: false,
        isChecking: false,
        models: [],
        error: err instanceof Error ? err.message : 'Failed to connect to Ollama',
      })
      setOllamaInstalled(false)
    }
  }, [provider, setOllamaInstalled, setModelsInstalled, translationModel, correctionModel])

  useEffect(() => {
    checkConnection()

    // A host change or an unmount retires the check that is still in flight.
    return () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
    }
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
