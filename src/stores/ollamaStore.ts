import { create } from 'zustand'
import { OllamaClient } from '../lib/ollama-client'
import { OllamaModelInfo } from '../types'
import { useSettingsStore } from './settingsStore'

const NOT_CONNECTED_ERROR = 'Cannot connect to Ollama. Make sure it is running.'
const CONNECT_FAILED_ERROR = 'Failed to connect to Ollama'
const PULL_FAILED_ERROR = 'Failed to pull model'
const PULL_STARTING_STATUS = 'starting'

/**
 * Lifecycle transport seam. It stays narrower than the generation `AiProvider`
 * contract and only adds the model management calls this runtime owns.
 */
export interface OllamaLifecycleClient {
  checkHealth(signal?: AbortSignal): Promise<boolean>
  listModels(signal?: AbortSignal): Promise<OllamaModelInfo[]>
  pullModel(
    modelName: string,
    onProgress?: (status: string) => void,
    signal?: AbortSignal
  ): Promise<void>
}

export type OllamaLifecycleClientFactory = (host: string) => OllamaLifecycleClient

export interface PullProgress {
  model: string
  status: string
}

export interface OllamaLifecycleState {
  host: string | null
  isConnected: boolean
  isChecking: boolean
  models: OllamaModelInfo[]
  error: string | null
  pull: PullProgress | null
  configureHost: (host: string) => void
  checkConnection: () => Promise<void>
  pullModel: (modelName: string) => Promise<void>
  syncRequiredModels: () => void
  hasModel: (modelName: string) => boolean
}

const defaultClientFactory: OllamaLifecycleClientFactory = host => new OllamaClient(host)

// === Runtime identity ===
// The runtime owns one immutable-host client at a time. Every async
// continuation compares the generation, the host, and its own abort signal
// before touching runtime state, pull progress, or the persisted flags.
let createClient: OllamaLifecycleClientFactory = defaultClientFactory
let client: OllamaLifecycleClient | null = null
let generation = 0
let controller: AbortController | null = null
let listCommitted = false

interface InFlight {
  host: string
  generation: number
  promise: Promise<void>
}

let activeCheck: InFlight | null = null
const activePulls = new Map<string, InFlight>()

// The pull that currently owns the single progress slot. A superseding pull
// takes ownership, so an older one can neither publish progress nor clear it.
let pullOwner: InFlight | null = null

// Model listings are issued by checks and by pull refreshes alike, so a
// generation alone cannot order them. Each listing takes a monotonic ticket and
// only a newer ticket may commit.
let listTicket = 0
let committedListTicket = 0

function retireActiveWork(): void {
  generation += 1
  controller?.abort()
  controller = null
  activeCheck = null
  activePulls.clear()
  pullOwner = null
  committedListTicket = 0
}

function currentController(): AbortController {
  if (!controller || controller.signal.aborted) {
    controller = new AbortController()
  }
  return controller
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function requiredModelsPresent(models: OllamaModelInfo[]): boolean {
  const { translationModel, correctionModel } = useSettingsStore.getState()
  const names = models.map(model => model.name)
  return names.includes(translationModel) && names.includes(correctionModel)
}

const initialState = {
  host: null as string | null,
  isConnected: false,
  isChecking: false,
  models: [] as OllamaModelInfo[],
  error: null as string | null,
  pull: null as PullProgress | null,
}

export const useOllamaStore = create<OllamaLifecycleState>((set, get) => {
  /**
   * Publishes a healthy result plus the status the settings snapshot derives.
   * An out-of-order listing from an earlier request is dropped.
   */
  const commitModels = (models: OllamaModelInfo[], ticket: number): void => {
    if (ticket < committedListTicket) return
    committedListTicket = ticket
    listCommitted = true
    set({ isConnected: true, isChecking: false, models, error: null })
    const settings = useSettingsStore.getState()
    settings.setOllamaInstalled(true)
    settings.setModelsInstalled(requiredModelsPresent(models))
  }

  // `modelsInstalled` deliberately survives a failed check: it stays the last
  // known answer for the host until a listing recomputes it, as it did before
  // the lifecycle moved into this runtime.
  const commitDisconnected = (error: string): void => {
    listCommitted = false
    set({ isConnected: false, isChecking: false, models: [], error, pull: null })
    useSettingsStore.getState().setOllamaInstalled(false)
  }

  /** Retires current work and binds the runtime to one immutable-host client. */
  const bindHost = (host: string, previousHost: string | null): OllamaLifecycleClient => {
    retireActiveWork()
    const bound = createClient(host)
    client = bound
    listCommitted = false
    set({ ...initialState, models: [], host })

    // A host change retires the status derived from the previous host; the
    // first binding keeps the persisted restart gate intact.
    if (previousHost !== null && previousHost !== host) {
      const settings = useSettingsStore.getState()
      settings.setOllamaInstalled(false)
      settings.setModelsInstalled(false)
    }
    return bound
  }

  /** Resolves the host and its client, binding them on first use. */
  const activeTarget = (): { host: string; lifecycleClient: OllamaLifecycleClient } => {
    const host = get().host
    if (host !== null && client) return { host, lifecycleClient: client }
    const nextHost = host ?? useSettingsStore.getState().ollamaHost
    return { host: nextHost, lifecycleClient: bindHost(nextHost, host) }
  }

  return {
    ...initialState,

    configureHost: host => {
      const previousHost = get().host
      if (previousHost === host && client) return
      bindHost(host, previousHost)
    },

    checkConnection: () => {
      const { host, lifecycleClient } = activeTarget()
      if (activeCheck && activeCheck.host === host && activeCheck.generation === generation) {
        return activeCheck.promise
      }

      const requestController = currentController()
      const requestGeneration = generation
      const isCurrent = () =>
        generation === requestGeneration &&
        get().host === host &&
        !requestController.signal.aborted

      const entry: InFlight = { host, generation: requestGeneration, promise: Promise.resolve() }

      const run = async (): Promise<void> => {
        set({ isChecking: true, error: null })
        try {
          const isHealthy = await lifecycleClient.checkHealth(requestController.signal)
          if (!isCurrent()) return

          if (!isHealthy) {
            commitDisconnected(NOT_CONNECTED_ERROR)
            return
          }

          const ticket = ++listTicket
          const models = await lifecycleClient.listModels(requestController.signal)
          if (!isCurrent()) return

          commitModels(models, ticket)
        } catch (err) {
          if (!isCurrent()) return
          commitDisconnected(errorMessage(err, CONNECT_FAILED_ERROR))
        } finally {
          if (activeCheck === entry) activeCheck = null
        }
      }

      entry.promise = run()
      activeCheck = entry
      return entry.promise
    },

    pullModel: modelName => {
      const { host, lifecycleClient } = activeTarget()
      const key = JSON.stringify([host, modelName])
      const activePull = activePulls.get(key)
      if (activePull && activePull.generation === generation) {
        return activePull.promise
      }

      const requestController = currentController()
      const requestGeneration = generation
      const isCurrent = () =>
        generation === requestGeneration &&
        get().host === host &&
        !requestController.signal.aborted

      const entry: InFlight = { host, generation: requestGeneration, promise: Promise.resolve() }

      const ownsProgress = () => pullOwner === entry
      const releaseProgress = () => {
        if (!ownsProgress()) return
        pullOwner = null
        set({ pull: null })
      }

      const run = async (): Promise<void> => {
        pullOwner = entry
        set({ pull: { model: modelName, status: PULL_STARTING_STATUS } })
        try {
          await lifecycleClient.pullModel(
            modelName,
            status => {
              if (isCurrent() && ownsProgress()) set({ pull: { model: modelName, status } })
            },
            requestController.signal
          )
          if (!isCurrent()) return

          releaseProgress()
          const ticket = ++listTicket
          const models = await lifecycleClient.listModels(requestController.signal)
          if (!isCurrent()) return

          commitModels(models, ticket)
        } catch (err) {
          if (!isCurrent()) return
          releaseProgress()
          set({ error: errorMessage(err, PULL_FAILED_ERROR) })
        } finally {
          if (activePulls.get(key) === entry) activePulls.delete(key)
        }
      }

      entry.promise = run()
      activePulls.set(key, entry)
      return entry.promise
    },

    syncRequiredModels: () => {
      if (!listCommitted) return
      useSettingsStore.getState().setModelsInstalled(requiredModelsPresent(get().models))
    },

    hasModel: modelName => get().models.some(model => model.name === modelName),
  }
})

/**
 * Replaces the lifecycle transport factory; `null` restores `OllamaClient`.
 * Tests use this to drive the runtime deterministically.
 */
export function setOllamaLifecycleClientFactory(
  factory: OllamaLifecycleClientFactory | null
): void {
  createClient = factory ?? defaultClientFactory
}

/** Retires in-flight lifecycle work and returns the runtime to its initial state. */
export function resetOllamaRuntime(): void {
  retireActiveWork()
  client = null
  listCommitted = false
  useOllamaStore.setState({ ...initialState, models: [] })
}
