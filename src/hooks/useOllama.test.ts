import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOllama, useOllamaLifecycle } from './useOllama'
import { useSettingsStore } from '../stores/settingsStore'
import {
  resetOllamaRuntime,
  setOllamaLifecycleClientFactory,
  useOllamaStore,
  type OllamaLifecycleClient,
  type OllamaLifecycleClientFactory,
} from '../stores/ollamaStore'

// The lifecycle transport is shared by the whole application; every hook here
// observes the same runtime through the same fake client.
const transport = {
  constructedHosts: [] as string[],
  checkHealth: vi.fn(),
  listModels: vi.fn(),
  pullModel: vi.fn(),
}

const fakeFactory: OllamaLifecycleClientFactory = (host): OllamaLifecycleClient => {
  transport.constructedHosts.push(host)
  return {
    checkHealth: transport.checkHealth,
    listModels: transport.listModels,
    pullModel: transport.pullModel,
  }
}

const MODIFIED_AT = '2026-01-01T00:00:00Z'

/** Mounts the application lifecycle coordinator next to a consumer adapter. */
function renderApp() {
  return renderHook(() => {
    useOllamaLifecycle()
    return useOllama()
  })
}

describe('useOllama', () => {
  const mockModels = [
    { name: 'gemma3:4b', size: 1000000, modified_at: MODIFIED_AT },
    { name: 'llama3:8b', size: 2000000, modified_at: MODIFIED_AT },
  ]

  beforeEach(() => {
    // Reset store
    useSettingsStore.setState({
      ollamaHost: 'http://localhost:11434',
      ollamaInstalled: false,
      modelsInstalled: false,
      translationModel: 'gemma3:4b',
      correctionModel: 'gemma3:4b',
    })

    // Reset mocks
    transport.constructedHosts.length = 0
    transport.checkHealth.mockReset()
    transport.listModels.mockReset()
    transport.pullModel.mockReset()

    setOllamaLifecycleClientFactory(fakeFactory)
    resetOllamaRuntime()
  })

  afterEach(() => {
    resetOllamaRuntime()
    setOllamaLifecycleClientFactory(null)
    vi.clearAllMocks()
  })

  it('returns initial checking state', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    expect(result.current.isChecking).toBe(true)
    expect(result.current.isConnected).toBe(false)

    // Drain the initial connection effect so its state updates stay inside act
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false)
    })
  })

  it('connects successfully when Ollama is running', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.isChecking).toBe(false)
    expect(result.current.models).toEqual(mockModels)
    expect(result.current.error).toBeNull()
  })

  it('sets ollamaInstalled when connected', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    renderApp()

    await waitFor(() => {
      expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    })
  })

  it('sets modelsInstalled when required models exist', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    renderApp()

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(true)
    })
  })

  it('handles connection failure when Ollama not running', async () => {
    transport.checkHealth.mockResolvedValue(false)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.error).toBe('Cannot connect to Ollama. Make sure it is running.')
    })

    expect(result.current.isConnected).toBe(false)
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles network error', async () => {
    transport.checkHealth.mockRejectedValue(new Error('Network error'))

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.error).toBe('Network error')
    })

    expect(result.current.isConnected).toBe(false)
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    transport.checkHealth.mockRejectedValue('string error')

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to connect to Ollama')
    })
  })

  it('constructs a client bound to the configured host', async () => {
    useSettingsStore.setState({ ollamaHost: 'http://custom:8080' })
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue([])

    renderApp()

    await waitFor(() => {
      expect(transport.constructedHosts).toEqual(['http://custom:8080'])
    })
  })

  it('hasModel returns true for exact model name match', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Exact match required - full model name with tag
    expect(result.current.hasModel('gemma3:4b')).toBe(true)
    expect(result.current.hasModel('llama3:8b')).toBe(true)
  })

  it('hasModel returns false for partial model name', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Partial names should NOT match - prevents qwen2.5 matching qwen2.5-coder
    expect(result.current.hasModel('gemma3')).toBe(false)
    expect(result.current.hasModel('llama3')).toBe(false)
  })

  it('hasModel correctly distinguishes similar model names', async () => {
    const similarModels = [
      { name: 'qwen2.5:7b', size: 1000000, modified_at: MODIFIED_AT },
      { name: 'qwen2.5-coder:1.5b', size: 500000, modified_at: MODIFIED_AT },
    ]
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(similarModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Each model should only match its exact name
    expect(result.current.hasModel('qwen2.5:7b')).toBe(true)
    expect(result.current.hasModel('qwen2.5-coder:1.5b')).toBe(true)
    expect(result.current.hasModel('qwen2.5-coder:7b')).toBe(false)
    expect(result.current.hasModel('qwen2.5:1.5b')).toBe(false)
  })

  it('hasModel returns false for non-existing model', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.hasModel('mistral')).toBe(false)
  })

  it('checkConnection can be called manually', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderApp()

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Clear mocks and call again
    transport.checkHealth.mockClear()
    transport.listModels.mockClear()

    await act(async () => {
      await result.current.checkConnection()
    })

    expect(transport.checkHealth).toHaveBeenCalled()
    expect(transport.listModels).toHaveBeenCalled()
  })

  it('modelsInstalled is false when required models missing', async () => {
    useSettingsStore.setState({
      translationModel: 'mistral:7b',
      correctionModel: 'mistral:7b',
    })
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    renderApp()

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    })
  })

  it('exposes the pull action of the shared runtime', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue([])
    transport.pullModel.mockResolvedValue(undefined)

    const { result } = renderApp()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    transport.listModels.mockResolvedValue(mockModels)
    await act(async () => {
      await result.current.pullModel('gemma3:4b')
    })

    expect(transport.pullModel).toHaveBeenCalledWith(
      'gemma3:4b',
      expect.any(Function),
      expect.any(AbortSignal)
    )
    expect(result.current.models).toEqual(mockModels)
    expect(result.current.pull).toBeNull()
  })
})

describe('useOllama application ownership', () => {
  const models = [{ name: 'gemma3:4b', size: 1, modified_at: MODIFIED_AT }]

  beforeEach(() => {
    useSettingsStore.setState({
      ollamaHost: 'http://localhost:11434',
      ollamaInstalled: false,
      modelsInstalled: false,
      translationModel: 'gemma3:4b',
      correctionModel: 'gemma3:4b',
    })
    transport.constructedHosts.length = 0
    transport.checkHealth.mockReset()
    transport.listModels.mockReset()
    transport.pullModel.mockReset()

    setOllamaLifecycleClientFactory(fakeFactory)
    resetOllamaRuntime()
  })

  afterEach(() => {
    resetOllamaRuntime()
    setOllamaLifecycleClientFactory(null)
    vi.clearAllMocks()
  })

  it('does not start lifecycle work from a consumer adapter', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(models)

    const { result } = renderHook(() => useOllama())

    // Give any effect the adapter might own a chance to run.
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isChecking).toBe(false)
    expect(result.current.isConnected).toBe(false)
    expect(transport.constructedHosts).toEqual([])
    expect(transport.checkHealth).not.toHaveBeenCalled()
  })

  it('serves a second consumer from the same in-flight request and one flag commit', async () => {
    const setOllamaInstalled = vi.spyOn(useSettingsStore.getState(), 'setOllamaInstalled')
    let resolveHealth!: (value: boolean) => void
    transport.checkHealth.mockReturnValue(
      new Promise<boolean>(resolve => {
        resolveHealth = resolve
      })
    )
    transport.listModels.mockResolvedValue(models)

    const main = renderApp()
    await waitFor(() => expect(transport.checkHealth).toHaveBeenCalledTimes(1))

    // Opening settings mounts another consumer while the main window stays up.
    const settings = renderHook(() => useOllama())
    expect(settings.result.current.isChecking).toBe(true)

    await act(async () => {
      resolveHealth(true)
    })

    await waitFor(() => expect(main.result.current.isConnected).toBe(true))
    expect(settings.result.current.isConnected).toBe(true)
    expect(settings.result.current.models).toEqual(models)
    expect(transport.constructedHosts).toEqual(['http://localhost:11434'])
    expect(transport.checkHealth).toHaveBeenCalledTimes(1)
    expect(transport.listModels).toHaveBeenCalledTimes(1)
    expect(setOllamaInstalled).toHaveBeenCalledTimes(1)
    expect(setOllamaInstalled).toHaveBeenCalledWith(true)
  })

  it('keeps the application lifecycle running when a consumer unmounts', async () => {
    let resolveHealth!: (value: boolean) => void
    transport.checkHealth.mockReturnValue(
      new Promise<boolean>(resolve => {
        resolveHealth = resolve
      })
    )
    transport.listModels.mockResolvedValue(models)

    const main = renderApp()
    const settings = renderHook(() => useOllama())
    await waitFor(() => expect(transport.checkHealth).toHaveBeenCalledTimes(1))

    settings.unmount()

    await act(async () => {
      resolveHealth(true)
    })

    await waitFor(() => expect(main.result.current.isConnected).toBe(true))
    expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
  })

  it('retires owned lifecycle work when the application owner unmounts', async () => {
    const healthSignals: (AbortSignal | undefined)[] = []
    let resolveHealth!: (value: boolean) => void
    transport.checkHealth.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise<boolean>(resolve => {
          healthSignals.push(signal)
          resolveHealth = resolve
        })
    )
    transport.listModels.mockResolvedValue(models)

    const main = renderApp()
    await waitFor(() => expect(transport.checkHealth).toHaveBeenCalledTimes(1))

    main.unmount()
    expect(healthSignals[0]?.aborted).toBe(true)

    await act(async () => {
      resolveHealth(true)
    })

    expect(transport.listModels).not.toHaveBeenCalled()
    expect(useOllamaStore.getState().isConnected).toBe(false)
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('forwards a request signal to the health and model calls', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(models)

    const { result } = renderApp()

    await waitFor(() => expect(result.current.isConnected).toBe(true))

    expect(transport.checkHealth.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
    expect(transport.listModels.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  })

  it('starts one check for a new host and retires the old one', async () => {
    const healthResolvers: ((value: boolean) => void)[] = []
    const healthSignals: (AbortSignal | undefined)[] = []
    transport.checkHealth.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise<boolean>(resolve => {
          healthSignals.push(signal)
          healthResolvers.push(resolve)
        })
    )
    transport.listModels.mockResolvedValue(models)

    const { result } = renderApp()
    await waitFor(() => expect(healthResolvers).toHaveLength(1))

    act(() => {
      useSettingsStore.setState({ ollamaHost: 'http://remote:11434' })
    })

    await waitFor(() => expect(healthResolvers).toHaveLength(2))
    expect(healthSignals[0]?.aborted).toBe(true)
    expect(transport.constructedHosts).toEqual([
      'http://localhost:11434',
      'http://remote:11434',
    ])

    // The new host connects; the retired host answers afterwards.
    await act(async () => {
      healthResolvers[1](true)
    })
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    await act(async () => {
      healthResolvers[0](false)
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.error).toBeNull()
    expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    expect(transport.listModels).toHaveBeenCalledTimes(1)
  })

  it('recomputes model status on a selection change without a new request', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(models)

    renderApp()
    await waitFor(() => expect(useSettingsStore.getState().modelsInstalled).toBe(true))

    act(() => {
      useSettingsStore.setState({ correctionModel: 'mistral:7b' })
    })

    expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    expect(transport.checkHealth).toHaveBeenCalledTimes(1)
    expect(transport.listModels).toHaveBeenCalledTimes(1)
  })
})
