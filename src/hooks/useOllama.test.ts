import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useOllama } from './useOllama'
import { useSettingsStore } from '../stores/settingsStore'

// Mock the transport class: each hook instance owns a client for one host.
const transport = vi.hoisted(() => ({
  constructedHosts: [] as string[],
  checkHealth: vi.fn(),
  listModels: vi.fn(),
}))

vi.mock('../lib/ollama-client', () => ({
  OllamaClient: class MockOllamaClient {
    checkHealth = transport.checkHealth
    listModels = transport.listModels

    constructor(baseUrl: string) {
      transport.constructedHosts.push(baseUrl)
    }
  },
}))

const MODIFIED_AT = '2026-01-01T00:00:00Z'

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
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial checking state', () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    expect(result.current.isChecking).toBe(true)
    expect(result.current.isConnected).toBe(false)
  })

  it('connects successfully when Ollama is running', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

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

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    })
  })

  it('sets modelsInstalled when required models exist', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(true)
    })
  })

  it('handles connection failure when Ollama not running', async () => {
    transport.checkHealth.mockResolvedValue(false)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
    })

    expect(result.current.error).toBe('Cannot connect to Ollama. Make sure it is running.')
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles network error', async () => {
    transport.checkHealth.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.error).toBe('Network error')
    })

    expect(result.current.isConnected).toBe(false)
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    transport.checkHealth.mockRejectedValue('string error')

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to connect to Ollama')
    })
  })

  it('constructs a client bound to the configured host', async () => {
    useSettingsStore.setState({ ollamaHost: 'http://custom:8080' })
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue([])

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(transport.constructedHosts).toEqual(['http://custom:8080'])
    })
  })

  it('hasModel returns true for exact model name match', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

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

    const { result } = renderHook(() => useOllama())

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

    const { result } = renderHook(() => useOllama())

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

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.hasModel('mistral')).toBe(false)
  })

  it('checkConnection can be called manually', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Clear mocks and call again
    transport.checkHealth.mockClear()
    transport.listModels.mockClear()

    await result.current.checkConnection()

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

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    })
  })
})

describe('useOllama cancellation and races', () => {
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
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards a request signal to the health and model calls', async () => {
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockResolvedValue(models)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => expect(result.current.isConnected).toBe(true))

    expect(transport.checkHealth.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
    expect(transport.listModels.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  })

  it('lets only the newest check publish its status and store flags', async () => {
    const healthResolvers: ((value: boolean) => void)[] = []
    transport.checkHealth.mockImplementation(
      () => new Promise(resolve => { healthResolvers.push(resolve) })
    )
    transport.listModels.mockResolvedValue(models)

    const { result } = renderHook(() => useOllama())
    await waitFor(() => expect(healthResolvers.length).toBe(1))

    await act(async () => {
      result.current.checkConnection()
    })
    await waitFor(() => expect(healthResolvers.length).toBe(2))

    // The newest check succeeds, then the superseded one reports a failure.
    await act(async () => {
      healthResolvers[1](true)
    })
    await act(async () => {
      healthResolvers[0](false)
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.error).toBeNull()
    expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
  })

  it('ignores a superseded model listing', async () => {
    const listResolvers: ((value: typeof models) => void)[] = []
    transport.checkHealth.mockResolvedValue(true)
    transport.listModels.mockImplementation(
      () => new Promise(resolve => { listResolvers.push(resolve) })
    )

    const { result } = renderHook(() => useOllama())
    await waitFor(() => expect(listResolvers.length).toBe(1))

    await act(async () => {
      result.current.checkConnection()
    })
    await waitFor(() => expect(listResolvers.length).toBe(2))

    await act(async () => {
      listResolvers[1](models)
    })
    await act(async () => {
      listResolvers[0]([])
    })

    expect(result.current.models).toEqual(models)
    expect(useSettingsStore.getState().modelsInstalled).toBe(true)
  })

  it('does not publish an error for a check cancelled by unmount', async () => {
    let rejectHealth: (reason: unknown) => void
    transport.checkHealth.mockReturnValue(
      new Promise((_resolve, reject) => { rejectHealth = reject })
    )

    const { result, unmount } = renderHook(() => useOllama())
    await waitFor(() => expect(transport.checkHealth).toHaveBeenCalled())

    const stateBefore = result.current
    unmount()

    await act(async () => {
      rejectHealth!(new Error('Network error'))
    })

    expect(stateBefore.error).toBeNull()
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })
})
