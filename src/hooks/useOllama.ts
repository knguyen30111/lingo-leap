import { useEffect } from 'react'
import { useOllamaStore } from '../stores/ollamaStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Read/action adapter over the application-wide Ollama lifecycle runtime.
 * Consumers subscribe to the shared snapshot; they own no request, abort
 * controller, or persisted status write of their own.
 */
export function useOllama() {
  const isConnected = useOllamaStore(state => state.isConnected)
  const isChecking = useOllamaStore(state => state.isChecking)
  const models = useOllamaStore(state => state.models)
  const error = useOllamaStore(state => state.error)
  const pull = useOllamaStore(state => state.pull)
  const checkConnection = useOllamaStore(state => state.checkConnection)
  const pullModel = useOllamaStore(state => state.pullModel)
  const hasModel = useOllamaStore(state => state.hasModel)

  return {
    isConnected,
    isChecking,
    models,
    error,
    pull,
    checkConnection,
    pullModel,
    hasModel,
  }
}

/**
 * Application-lifetime lifecycle coordinator. Mounted exactly once, it binds
 * the runtime to the configured host and keeps derived model status in step
 * with the selected models without spending an extra request.
 *
 * The runtime is document-lifetime state, not state this effect owns, so the
 * coordinator never retires it on cleanup: a replayed mount would otherwise
 * abort the very request it is about to repeat. A root teardown that really
 * ends the document calls `retireOllamaLifecycleWork` explicitly.
 */
export function useOllamaLifecycle(): void {
  const ollamaHost = useSettingsStore(state => state.ollamaHost)
  const translationModel = useSettingsStore(state => state.translationModel)
  const correctionModel = useSettingsStore(state => state.correctionModel)
  const configureHost = useOllamaStore(state => state.configureHost)
  const checkConnection = useOllamaStore(state => state.checkConnection)
  const syncRequiredModels = useOllamaStore(state => state.syncRequiredModels)

  useEffect(() => {
    configureHost(ollamaHost)
    void checkConnection()
  }, [ollamaHost, configureHost, checkConnection])

  // A model selection is answered from the cached list; only a host change
  // needs the network.
  useEffect(() => {
    syncRequiredModels()
  }, [translationModel, correctionModel, syncRequiredModels])
}
