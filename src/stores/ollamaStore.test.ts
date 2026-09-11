import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  useOllamaStore,
  setOllamaLifecycleClientFactory,
  resetOllamaRuntime,
  type OllamaLifecycleClient,
  type OllamaLifecycleClientFactory,
} from './ollamaStore'
import { useSettingsStore } from './settingsStore'
import { OllamaModelInfo } from '../types'

const MODIFIED_AT = '2026-01-01T00:00:00Z'
const HOST_A = 'http://localhost:11434'
const HOST_B = 'http://remote:11434'

const modelsA: OllamaModelInfo[] = [
  { name: 'gemma3:4b', size: 1000000, modified_at: MODIFIED_AT },
  { name: 'llama3:8b', size: 2000000, modified_at: MODIFIED_AT },
]
const modelsB: OllamaModelInfo[] = [
  { name: 'qwen2.5:7b', size: 3000000, modified_at: MODIFIED_AT },
]

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface RecordedCall<T> extends Deferred<T> {
  host: string
  signal?: AbortSignal
}

interface RecordedPull extends RecordedCall<void> {
  model: string
  onProgress?: (status: string) => void
}

/**
 * Deterministic lifecycle transport: every call is recorded with its host and
 * signal, and stays pending until the test resolves it in the chosen order.
 */
const transport = {
  hosts: [] as string[],
  health: [] as RecordedCall<boolean>[],
  list: [] as RecordedCall<OllamaModelInfo[]>[],
  pulls: [] as RecordedPull[],
}

const fakeFactory: OllamaLifecycleClientFactory = (host): OllamaLifecycleClient => {
  transport.hosts.push(host)
  return {
    checkHealth: (signal?: AbortSignal) => {
      const call = { host, signal, ...deferred<boolean>() }
      transport.health.push(call)
      return call.promise
    },
    listModels: (signal?: AbortSignal) => {
      const call = { host, signal, ...deferred<OllamaModelInfo[]>() }
      transport.list.push(call)
      return call.promise
    },
    pullModel: (
      model: string,
      onProgress?: (status: string) => void,
      signal?: AbortSignal
    ) => {
      const call = { host, model, onProgress, signal, ...deferred<void>() }
      transport.pulls.push(call)
      return call.promise
    },
  }
}

/** Lets every already-scheduled continuation run before the next assertion. */
async function drain(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function settings() {
  return useSettingsStore.getState()
}

function runtime() {
  return useOllamaStore.getState()
}

/** Connects HOST_A with the given model list through the fake transport. */
async function connect(host: string, models: OllamaModelInfo[]): Promise<void> {
  runtime().configureHost(host)
  const checking = runtime().checkConnection()
  await drain()
  transport.health[transport.health.length - 1].resolve(true)
  await drain()
  transport.list[transport.list.length - 1].resolve(models)
  await checking
}

describe('ollamaStore lifecycle runtime', () => {
  beforeEach(() => {
    transport.hosts.length = 0
    transport.health.length = 0
    transport.list.length = 0
    transport.pulls.length = 0

    setOllamaLifecycleClientFactory(fakeFactory)
    resetOllamaRuntime()

    useSettingsStore.setState({
      ollamaHost: HOST_A,
      ollamaInstalled: false,
      modelsInstalled: false,
      translationModel: 'gemma3:4b',
      correctionModel: 'llama3:8b',
    })
  })

  afterEach(() => {
    resetOllamaRuntime()
    setOllamaLifecycleClientFactory(null)
  })

  describe('initial state', () => {
    it('starts with no host and no lifecycle work', () => {
      const state = runtime()
      expect(state.host).toBeNull()
      expect(state.isConnected).toBe(false)
      expect(state.isChecking).toBe(false)
      expect(state.models).toEqual([])
      expect(state.error).toBeNull()
      expect(state.pull).toBeNull()
      expect(transport.hosts).toEqual([])
    })

    it('configuring the first host does not clear the persisted setup gate', () => {
      useSettingsStore.setState({ ollamaInstalled: true, modelsInstalled: true })

      runtime().configureHost(HOST_A)

      expect(settings().ollamaInstalled).toBe(true)
      expect(settings().modelsInstalled).toBe(true)
    })

    it('builds one immutable client for the configured host', () => {
      runtime().configureHost(HOST_A)
      runtime().configureHost(HOST_A)

      expect(transport.hosts).toEqual([HOST_A])
    })

    it('falls back to the persisted host when a check runs unconfigured', async () => {
      useSettingsStore.setState({ ollamaHost: HOST_B })

      const checking = runtime().checkConnection()
      await drain()
      transport.health[0].resolve(false)
      await checking

      expect(transport.hosts).toEqual([HOST_B])
      expect(runtime().host).toBe(HOST_B)
    })
  })

  describe('same-host deduplication', () => {
    it('shares one in-flight promise and issues one health and one list request', async () => {
      runtime().configureHost(HOST_A)

      const first = runtime().checkConnection()
      const second = runtime().checkConnection()

      expect(second).toBe(first)
      await drain()
      expect(transport.health).toHaveLength(1)

      transport.health[0].resolve(true)
      await drain()
      expect(transport.list).toHaveLength(1)

      transport.list[0].resolve(modelsA)
      await Promise.all([first, second])

      expect(runtime().isConnected).toBe(true)
      expect(runtime().models).toEqual(modelsA)
      expect(settings().ollamaInstalled).toBe(true)
      expect(transport.health).toHaveLength(1)
      expect(transport.list).toHaveLength(1)
    })

    it('allows a new request once the shared check settled', async () => {
      await connect(HOST_A, modelsA)

      const retry = runtime().checkConnection()
      await drain()
      expect(transport.health).toHaveLength(2)

      transport.health[1].resolve(true)
      await drain()
      transport.list[1].resolve(modelsA)
      await retry

      expect(runtime().isConnected).toBe(true)
    })

    it('forwards an abort signal to health and list requests', async () => {
      await connect(HOST_A, modelsA)

      expect(transport.health[0].signal).toBeInstanceOf(AbortSignal)
      expect(transport.list[0].signal).toBeInstanceOf(AbortSignal)
    })
  })

  describe('host changes retire old work', () => {
    it('clears runtime state and both persisted flags on a host change', async () => {
      await connect(HOST_A, modelsA)
      expect(settings().ollamaInstalled).toBe(true)
      expect(settings().modelsInstalled).toBe(true)

      runtime().configureHost(HOST_B)

      const state = runtime()
      expect(state.host).toBe(HOST_B)
      expect(state.isConnected).toBe(false)
      expect(state.models).toEqual([])
      expect(state.error).toBeNull()
      expect(state.pull).toBeNull()
      expect(settings().ollamaInstalled).toBe(false)
      expect(settings().modelsInstalled).toBe(false)
    })

    it('aborts the in-flight check of the retired host', async () => {
      runtime().configureHost(HOST_A)
      runtime().checkConnection()
      await drain()

      runtime().configureHost(HOST_B)

      expect(transport.health[0].signal?.aborted).toBe(true)
    })

    it('ignores a superseded old-host health response', async () => {
      runtime().configureHost(HOST_A)
      const oldCheck = runtime().checkConnection()
      await drain()

      runtime().configureHost(HOST_B)
      const newCheck = runtime().checkConnection()
      await drain()

      // The new host succeeds first, then the retired host reports health.
      transport.health[1].resolve(true)
      await drain()
      transport.list[0].resolve(modelsB)
      await newCheck

      transport.health[0].resolve(true)
      await oldCheck
      await drain()

      expect(runtime().host).toBe(HOST_B)
      expect(runtime().models).toEqual(modelsB)
      expect(runtime().isConnected).toBe(true)
      expect(settings().ollamaInstalled).toBe(true)
      // The retired host never reached its model listing.
      expect(transport.list).toHaveLength(1)
    })

    it('ignores a superseded old-host model listing', async () => {
      runtime().configureHost(HOST_A)
      const oldCheck = runtime().checkConnection()
      await drain()
      transport.health[0].resolve(true)
      await drain()
      expect(transport.list).toHaveLength(1)

      runtime().configureHost(HOST_B)
      const newCheck = runtime().checkConnection()
      await drain()
      transport.health[1].resolve(true)
      await drain()
      transport.list[1].resolve(modelsB)
      await newCheck

      // The retired host finally answers with its own models.
      transport.list[0].resolve(modelsA)
      await oldCheck
      await drain()

      expect(runtime().models).toEqual(modelsB)
      expect(runtime().host).toBe(HOST_B)
    })

    it('does not let a retired host failure publish an error for the new host', async () => {
      runtime().configureHost(HOST_A)
      const oldCheck = runtime().checkConnection()
      await drain()

      runtime().configureHost(HOST_B)
      const newCheck = runtime().checkConnection()
      await drain()
      transport.health[1].resolve(true)
      await drain()
      transport.list[0].resolve(modelsB)
      await newCheck

      transport.health[0].reject(new Error('Network error'))
      await oldCheck
      await drain()

      expect(runtime().error).toBeNull()
      expect(runtime().isConnected).toBe(true)
      expect(settings().ollamaInstalled).toBe(true)
    })
  })

  describe('required model status', () => {
    it('commits exact-name model status from the current settings snapshot', async () => {
      await connect(HOST_A, modelsA)

      expect(settings().modelsInstalled).toBe(true)
    })

    it('marks models missing when a required name only partially matches', async () => {
      useSettingsStore.setState({ translationModel: 'gemma3', correctionModel: 'llama3:8b' })

      await connect(HOST_A, modelsA)

      expect(settings().modelsInstalled).toBe(false)
    })

    it('recomputes from the cached list without a new request', async () => {
      await connect(HOST_A, modelsA)
      expect(settings().modelsInstalled).toBe(true)

      useSettingsStore.setState({ correctionModel: 'mistral:7b' })
      runtime().syncRequiredModels()

      expect(settings().modelsInstalled).toBe(false)
      expect(transport.health).toHaveLength(1)
      expect(transport.list).toHaveLength(1)
    })

    it('does not write a model flag before a list was committed', () => {
      useSettingsStore.setState({ modelsInstalled: true })
      runtime().configureHost(HOST_A)

      runtime().syncRequiredModels()

      expect(settings().modelsInstalled).toBe(true)
    })

    it('commits the requirements current at list time, not at request time', async () => {
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()
      await drain()
      transport.health[0].resolve(true)
      await drain()

      // The user selects another model while the listing is still in flight.
      useSettingsStore.setState({ correctionModel: 'mistral:7b' })
      transport.list[0].resolve(modelsA)
      await checking

      expect(settings().modelsInstalled).toBe(false)
    })

    it('hasModel matches exact names only', async () => {
      await connect(HOST_A, [
        { name: 'qwen2.5:7b', size: 1, modified_at: MODIFIED_AT },
        { name: 'qwen2.5-coder:1.5b', size: 1, modified_at: MODIFIED_AT },
      ])

      expect(runtime().hasModel('qwen2.5:7b')).toBe(true)
      expect(runtime().hasModel('qwen2.5-coder:1.5b')).toBe(true)
      expect(runtime().hasModel('qwen2.5')).toBe(false)
      expect(runtime().hasModel('qwen2.5-coder:7b')).toBe(false)
    })
  })

  describe('failure and retry', () => {
    it('publishes the not-connected error and clears only the connection flag', async () => {
      useSettingsStore.setState({ modelsInstalled: true })
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()
      await drain()
      transport.health[0].resolve(false)
      await checking

      expect(runtime().isConnected).toBe(false)
      expect(runtime().isChecking).toBe(false)
      expect(runtime().error).toBe('Cannot connect to Ollama. Make sure it is running.')
      expect(settings().ollamaInstalled).toBe(false)
      expect(transport.list).toHaveLength(0)
    })

    it('publishes a thrown transport error message', async () => {
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()
      await drain()
      transport.health[0].reject(new Error('Network error'))
      await checking

      expect(runtime().error).toBe('Network error')
      expect(settings().ollamaInstalled).toBe(false)
    })

    it('publishes a fallback message for a non-Error rejection', async () => {
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()
      await drain()
      transport.health[0].reject('string error')
      await checking

      expect(runtime().error).toBe('Failed to connect to Ollama')
    })

    it('lets a later retry commit success after a failure', async () => {
      runtime().configureHost(HOST_A)
      const failing = runtime().checkConnection()
      await drain()
      transport.health[0].resolve(false)
      await failing

      await connect(HOST_A, modelsA)

      expect(runtime().isConnected).toBe(true)
      expect(runtime().error).toBeNull()
      expect(settings().ollamaInstalled).toBe(true)
    })

    it('reports checking while a request is in flight', async () => {
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()

      expect(runtime().isChecking).toBe(true)

      await drain()
      transport.health[0].resolve(false)
      await checking

      expect(runtime().isChecking).toBe(false)
    })
  })

  describe('model pull', () => {
    it('publishes streamed progress and refreshes the model list after success', async () => {
      await connect(HOST_A, [])

      const pulling = runtime().pullModel('gemma3:4b')
      await drain()
      const pull = transport.pulls[0]

      pull.onProgress?.('pulling manifest')
      expect(runtime().pull).toEqual({ model: 'gemma3:4b', status: 'pulling manifest' })
      pull.onProgress?.('verifying sha256')
      expect(runtime().pull).toEqual({ model: 'gemma3:4b', status: 'verifying sha256' })

      pull.resolve()
      await drain()
      transport.list[transport.list.length - 1].resolve(modelsA)
      await pulling

      expect(runtime().pull).toBeNull()
      expect(runtime().models).toEqual(modelsA)
      expect(settings().modelsInstalled).toBe(true)
    })

    it('shares one in-flight pull for the same host and model', async () => {
      await connect(HOST_A, [])

      const first = runtime().pullModel('gemma3:4b')
      const second = runtime().pullModel('gemma3:4b')

      expect(second).toBe(first)
      await drain()
      expect(transport.pulls).toHaveLength(1)

      transport.pulls[0].resolve()
      await drain()
      transport.list[transport.list.length - 1].resolve(modelsA)
      await Promise.all([first, second])

      expect(transport.pulls).toHaveLength(1)
    })

    it('pulls a different model with its own request', async () => {
      await connect(HOST_A, [])

      const first = runtime().pullModel('gemma3:4b')
      const second = runtime().pullModel('llama3:8b')

      expect(second).not.toBe(first)
      await drain()
      expect(transport.pulls).toHaveLength(2)

      transport.pulls[0].resolve()
      transport.pulls[1].resolve()
      await drain()
      transport.list.slice(1).forEach(call => call.resolve(modelsA))
      await Promise.all([first, second])

      expect(runtime().models).toEqual(modelsA)
    })

    it('suppresses progress and the refresh of a retired host pull', async () => {
      await connect(HOST_A, [])

      const pulling = runtime().pullModel('gemma3:4b')
      await drain()
      const pull = transport.pulls[0]

      runtime().configureHost(HOST_B)
      pull.onProgress?.('pulling manifest')

      expect(runtime().pull).toBeNull()
      expect(pull.signal?.aborted).toBe(true)

      const listCallsBefore = transport.list.length
      pull.resolve()
      await pulling
      await drain()

      expect(runtime().pull).toBeNull()
      expect(runtime().models).toEqual([])
      expect(transport.list).toHaveLength(listCallsBefore)
    })

    it('clears progress and publishes the error when a pull fails', async () => {
      await connect(HOST_A, modelsA)

      const pulling = runtime().pullModel('mistral:7b')
      await drain()
      transport.pulls[0].reject(new Error('Failed to pull model: Not Found'))
      await pulling

      expect(runtime().pull).toBeNull()
      expect(runtime().error).toBe('Failed to pull model: Not Found')
      expect(runtime().models).toEqual(modelsA)
    })

    it('publishes a fallback message for a non-Error pull rejection', async () => {
      await connect(HOST_A, modelsA)

      const pulling = runtime().pullModel('mistral:7b')
      await drain()
      transport.pulls[0].reject('stream died')
      await pulling

      expect(runtime().error).toBe('Failed to pull model')
    })

    it('keeps the newest listing when a check and a pull refresh race', async () => {
      await connect(HOST_A, [])

      const pulling = runtime().pullModel('gemma3:4b')
      await drain()

      // A check is in flight while the pull runs; its listing was issued first.
      const checking = runtime().checkConnection()
      await drain()
      transport.health[transport.health.length - 1].resolve(true)
      await drain()
      const checkList = transport.list[transport.list.length - 1]

      transport.pulls[0].resolve()
      await drain()
      const refreshList = transport.list[transport.list.length - 1]
      expect(refreshList).not.toBe(checkList)

      refreshList.resolve(modelsA)
      await drain()
      // The older listing answers last with the pre-pull inventory.
      checkList.resolve([])
      await Promise.all([pulling, checking])
      await drain()

      expect(runtime().models).toEqual(modelsA)
      expect(settings().modelsInstalled).toBe(true)
    })

    it('lets only the superseding pull publish progress', async () => {
      await connect(HOST_A, [])

      const first = runtime().pullModel('gemma3:4b')
      const second = runtime().pullModel('llama3:8b')
      await drain()
      expect(runtime().pull).toEqual({ model: 'llama3:8b', status: 'starting' })

      // The superseded pull may not publish over the newer one.
      transport.pulls[0].onProgress?.('pulling manifest')
      expect(runtime().pull).toEqual({ model: 'llama3:8b', status: 'starting' })

      transport.pulls[1].onProgress?.('verifying sha256')
      expect(runtime().pull).toEqual({ model: 'llama3:8b', status: 'verifying sha256' })

      // Nor may it clear the newer pull's progress when it finishes first.
      transport.pulls[0].resolve()
      await drain()
      transport.list[transport.list.length - 1].resolve(modelsA)
      await first
      expect(runtime().pull).toEqual({ model: 'llama3:8b', status: 'verifying sha256' })

      transport.pulls[1].resolve()
      await drain()
      transport.list[transport.list.length - 1].resolve(modelsA)
      await second

      expect(runtime().pull).toBeNull()
    })

    it('does not let a retired pull refresh publish a model list', async () => {
      await connect(HOST_A, [])

      const pulling = runtime().pullModel('gemma3:4b')
      await drain()
      transport.pulls[0].resolve()
      await drain()

      // The refresh listing is in flight when the user switches hosts.
      const refresh = transport.list[transport.list.length - 1]
      runtime().configureHost(HOST_B)
      refresh.resolve(modelsA)
      await pulling
      await drain()

      expect(runtime().host).toBe(HOST_B)
      expect(runtime().models).toEqual([])
      expect(runtime().isConnected).toBe(false)
      expect(settings().ollamaInstalled).toBe(false)
    })

    it('does not publish the error of a retired pull', async () => {
      await connect(HOST_A, modelsA)

      const pulling = runtime().pullModel('mistral:7b')
      await drain()

      runtime().configureHost(HOST_B)
      transport.pulls[0].reject(new Error('Failed to pull model: Not Found'))
      await pulling
      await drain()

      expect(runtime().error).toBeNull()
      expect(runtime().pull).toBeNull()
    })

    it('pulls against the persisted host when the runtime is unconfigured', async () => {
      useSettingsStore.setState({ ollamaHost: HOST_B })

      const pulling = runtime().pullModel('qwen2.5:7b')
      await drain()
      expect(transport.pulls[0].host).toBe(HOST_B)

      transport.pulls[0].resolve()
      await drain()
      transport.list[0].resolve(modelsB)
      await pulling

      expect(runtime().models).toEqual(modelsB)
    })
  })

  describe('default transport', () => {
    it('binds an OllamaClient to the configured host', () => {
      setOllamaLifecycleClientFactory(null)

      runtime().configureHost(HOST_B)

      expect(runtime().host).toBe(HOST_B)
      expect(transport.hosts).toEqual([])
    })
  })

  describe('runtime reset', () => {
    it('retires in-flight work so a stale response cannot publish', async () => {
      runtime().configureHost(HOST_A)
      const checking = runtime().checkConnection()
      await drain()

      resetOllamaRuntime()
      expect(transport.health[0].signal?.aborted).toBe(true)

      transport.health[0].resolve(true)
      await checking
      await drain()

      expect(runtime().host).toBeNull()
      expect(runtime().isConnected).toBe(false)
      expect(runtime().isChecking).toBe(false)
      expect(transport.list).toHaveLength(0)
    })
  })
})
