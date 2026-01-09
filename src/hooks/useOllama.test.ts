import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useOllama } from './useOllama'
import { useSettingsStore } from '../stores/settingsStore'
import { ollamaClient } from '../lib/ollama-client'

// Mock ollama client
vi.mock('../lib/ollama-client', () => ({
  ollamaClient: {
    setBaseUrl: vi.fn(),
    checkHealth: vi.fn(),
    listModels: vi.fn(),
  },
}))

describe('useOllama', () => {
  const mockModels = [
    { name: 'gemma3:4b', size: 1000000 },
    { name: 'llama3:8b', size: 2000000 },
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
    vi.mocked(ollamaClient.setBaseUrl).mockClear()
    vi.mocked(ollamaClient.checkHealth).mockReset()
    vi.mocked(ollamaClient.listModels).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns initial checking state', () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    expect(result.current.isChecking).toBe(true)
    expect(result.current.isConnected).toBe(false)
  })

  it('connects successfully when Ollama is running', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.isChecking).toBe(false)
    expect(result.current.models).toEqual(mockModels)
    expect(result.current.error).toBeNull()
  })

  it('sets ollamaInstalled when connected', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().ollamaInstalled).toBe(true)
    })
  })

  it('sets modelsInstalled when required models exist', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(true)
    })
  })

  it('handles connection failure when Ollama not running', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(false)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
    })

    expect(result.current.error).toBe('Cannot connect to Ollama. Make sure it is running.')
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles network error', async () => {
    vi.mocked(ollamaClient.checkHealth).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.error).toBe('Network error')
    })

    expect(result.current.isConnected).toBe(false)
    expect(useSettingsStore.getState().ollamaInstalled).toBe(false)
  })

  it('handles non-Error thrown', async () => {
    vi.mocked(ollamaClient.checkHealth).mockRejectedValue('string error')

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to connect to Ollama')
    })
  })

  it('sets base URL from settings', async () => {
    useSettingsStore.setState({ ollamaHost: 'http://custom:8080' })
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue([])

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(ollamaClient.setBaseUrl).toHaveBeenCalledWith('http://custom:8080')
    })
  })

  it('hasModel returns true for existing model', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.hasModel('gemma3')).toBe(true)
    expect(result.current.hasModel('gemma3:4b')).toBe(true)
  })

  it('hasModel returns false for non-existing model', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    expect(result.current.hasModel('mistral')).toBe(false)
  })

  it('checkConnection can be called manually', async () => {
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    const { result } = renderHook(() => useOllama())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // Clear mocks and call again
    vi.mocked(ollamaClient.checkHealth).mockClear()
    vi.mocked(ollamaClient.listModels).mockClear()

    await result.current.checkConnection()

    expect(ollamaClient.checkHealth).toHaveBeenCalled()
    expect(ollamaClient.listModels).toHaveBeenCalled()
  })

  it('modelsInstalled is false when required models missing', async () => {
    useSettingsStore.setState({
      translationModel: 'mistral:7b',
      correctionModel: 'mistral:7b',
    })
    vi.mocked(ollamaClient.checkHealth).mockResolvedValue(true)
    vi.mocked(ollamaClient.listModels).mockResolvedValue(mockModels)

    renderHook(() => useOllama())

    await waitFor(() => {
      expect(useSettingsStore.getState().modelsInstalled).toBe(false)
    })
  })
})
