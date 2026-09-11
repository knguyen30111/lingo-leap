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
// continuation compares the generation, the host, and its own abort signal to
// decide whether its request still stands; what a still-valid request may then
// publish is decided by the presentation ownership below.
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

// === Presentation ownership ===
// Owning the progress slot or the error channel is separate from a request
// being valid. A newer operation takes them over, which retires what an older
// one may publish; the older request keeps its own transport and still owes
// the runtime the factual model listing its success produces.
let pullOwner: InFlight | null = null
let errorOwner: InFlight | null = null

/** Hands the progress slot and the error channel to a starting pull. */
function claimPullPresentation(entry: InFlight): void {
  pullOwner = entry
  errorOwner = entry
}

function claimErrorChannel(entry: InFlight): void {
  errorOwner = entry
}

function ownsProgress(entry: InFlight): boolean {
  return pullOwner === entry
}

function ownsErrorChannel(entry: InFlight): boolean {
  return errorOwner === entry
}

// === Factual publication order ===
// Model listings and disconnect results are both factual, and both checks and
// pull refreshes produce them, so a generation alone cannot order them. Every
// factual result carries a monotonic ticket: a check takes one when it starts
// and carries it through its health answer and its listing, while a pull takes
// one only once its transfer succeeded, immediately before the refresh it owes.
// A result whose ticket is older than the committed one is stale and publishes
// nothing, and the committed ticket advances only when factual state actually
// publishes — so a failed pull and a failed refresh bar nothing.
let factualTicket = 0
let committedFactualTicket = 0

function reserveFactualTicket(): number {
  return ++factualTicket
}

function isStaleFactual(ticket: number): boolean {
  return ticket < committedFactualTicket
}

function retireActiveWork(): void {
  generation += 1
  controller?.abort()
  controller = null
  activeCheck = null
  activePulls.clear()
  pullOwner = null
  errorOwner = null
  committedFactualTicket = 0
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
   * A listing from a request a newer factual result already superseded is
   * dropped. `isChecking` belongs to the connection check, so a pull refresh
   * publishes an ordered listing here without settling a check that is still
   * pending. Models and the flags they derive are factual, so any valid ordered
   * listing may publish them; clearing the error is a presentation act reserved
   * for the operation that still owns the error channel.
   */
  const commitModels = (
    models: OllamaModelInfo[],
    ticket: number,
    ownsError: boolean
  ): void => {
    if (isStaleFactual(ticket)) return
    committedFactualTicket = ticket
    listCommitted = true
    set(ownsError ? { isConnected: true, models, error: null } : { isConnected: true, models })
    const settings = useSettingsStore.getState()
    settings.setOllamaInstalled(true)
    settings.setModelsInstalled(requiredModelsPresent(models))
  }

  /**
   * Publishes a failed check. Disconnection is a factual result, so it takes
   * its place in the same order as a listing: a check a newer factual result
   * already superseded settles only the spinner it owns and leaves the
   * connection state, the models, and the persisted flags alone. The progress
   * slot is never the check's to write, and the error message is presentation
   * reserved for the operation that still owns the error channel: a pull that
   * started later keeps presenting its own progress and its own failure.
   *
   * `modelsInstalled` deliberately survives a failed check: it stays the last
   * known answer for the host until a listing recomputes it, as it did before
   * the lifecycle moved into this runtime.
   */
  const commitDisconnected = (error: string, ticket: number, ownsError: boolean): void => {
    if (isStaleFactual(ticket)) {
      set({ isChecking: false })
      return
    }
    committedFactualTicket = ticket
    listCommitted = false
    set(
      ownsError
        ? { isConnected: false, isChecking: false, models: [], error }
        : { isConnected: false, isChecking: false, models: [] }
    )
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
      // The check takes its place in the factual order now and keeps it for
      // both the health answer and the listing that answer may lead to.
      const requestTicket = reserveFactualTicket()

      const run = async (): Promise<void> => {
        claimErrorChannel(entry)
        set({ isChecking: true, error: null })
        try {
          const isHealthy = await lifecycleClient.checkHealth(requestController.signal)
          if (!isCurrent()) return

          if (!isHealthy) {
            commitDisconnected(NOT_CONNECTED_ERROR, requestTicket, ownsErrorChannel(entry))
            return
          }

          // A listing issued from a superseded place in the factual order could
          // only answer with older inventory, so it is never requested; the
          // spinner is still this check's to settle.
          if (isStaleFactual(requestTicket)) {
            set({ isChecking: false })
            return
          }

          const models = await lifecycleClient.listModels(requestController.signal)
          if (!isCurrent()) return

          commitModels(models, requestTicket, ownsErrorChannel(entry))
          // The check owns `isChecking`, including when a newer listing has
          // already superseded the one it just fetched.
          set({ isChecking: false })
        } catch (err) {
          if (!isCurrent()) return
          commitDisconnected(
            errorMessage(err, CONNECT_FAILED_ERROR),
            requestTicket,
            ownsErrorChannel(entry)
          )
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
      const entry: InFlight = { host, generation: requestGeneration, promise: Promise.resolve() }

      // Request validity is a transport question only: the runtime target is
      // unchanged and the signal is live. A newer pull takes over what this one
      // may present, never whether its own request still stands.
      const isRequestValid = () =>
        generation === requestGeneration &&
        get().host === host &&
        !requestController.signal.aborted

      /** Frees the progress slot if this pull still holds it. */
      const releaseProgress = () => {
        if (!ownsProgress(entry)) return
        pullOwner = null
        set({ pull: null })
      }

      const run = async (): Promise<void> => {
        claimPullPresentation(entry)
        set({ pull: { model: modelName, status: PULL_STARTING_STATUS } })
        try {
          await lifecycleClient.pullModel(
            modelName,
            status => {
              if (isRequestValid() && ownsProgress(entry)) {
                set({ pull: { model: modelName, status } })
              }
            },
            requestController.signal
          )
          if (!isRequestValid()) return

          releaseProgress()
          // The refresh takes its place in the factual order only now: a pull
          // that never finished owes the runtime no listing and bars none.
          const ticket = reserveFactualTicket()
          const models = await lifecycleClient.listModels(requestController.signal)
          if (!isRequestValid()) return

          commitModels(models, ticket, ownsErrorChannel(entry))
        } catch (err) {
          if (!isRequestValid()) return
          releaseProgress()
          if (!ownsErrorChannel(entry)) return
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

/**
 * Retires lifecycle work on an explicit teardown of the application root. The
 * bound host, the committed snapshot, the user-facing error, and the persisted
 * flags survive; only the in-flight requests are dropped, so a late answer
 * cannot publish, and only the state those requests owned is cleared.
 */
export function retireOllamaLifecycleWork(): void {
  retireActiveWork()
  useOllamaStore.setState({ isChecking: false, pull: null })
}

/** Retires in-flight lifecycle work and returns the runtime to its initial state. */
export function resetOllamaRuntime(): void {
  retireActiveWork()
  client = null
  listCommitted = false
  useOllamaStore.setState({ ...initialState, models: [] })
}
