import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OllamaClient, ollamaClient } from './ollama-client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('OllamaClient', () => {
  let client: OllamaClient

  beforeEach(() => {
    client = new OllamaClient()
    mockFetch.mockReset()
  })

  describe('constructor and URL management', () => {
    it('uses default URL', () => {
      expect(client.getBaseUrl()).toBe('http://localhost:11434')
    })

    it('accepts custom URL in constructor', () => {
      const customClient = new OllamaClient('http://custom:1234')
      expect(customClient.getBaseUrl()).toBe('http://custom:1234')
    })

    it('setBaseUrl updates the URL', () => {
      client.setBaseUrl('http://new-url:5678')
      expect(client.getBaseUrl()).toBe('http://new-url:5678')
    })
  })

  describe('checkHealth', () => {
    it('returns true when server responds ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      const result = await client.checkHealth()
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('returns false when server responds with error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const result = await client.checkHealth()
      expect(result).toBe(false)
    })

    it('returns false when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await client.checkHealth()
      expect(result).toBe(false)
    })
  })

  describe('listModels', () => {
    it('returns models array on success', async () => {
      const models = [{ name: 'model1' }, { name: 'model2' }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models }),
      })
      const result = await client.listModels()
      expect(result).toEqual(models)
    })

    it('returns empty array when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const result = await client.listModels()
      expect(result).toEqual([])
    })

    it('returns empty array when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await client.listModels()
      expect(result).toEqual([])
    })

    it('returns empty array when models is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      const result = await client.listModels()
      expect(result).toEqual([])
    })
  })

  describe('generate', () => {
    it('returns response on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Generated text' }),
      })

      const result = await client.generate({
        model: 'test-model',
        prompt: 'Test prompt',
      })

      expect(result).toBe('Generated text')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"stream":false'),
        })
      )
    })

    it('throws on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(
        client.generate({ model: 'test', prompt: 'test' })
      ).rejects.toThrow('Ollama error: 500 Internal Server Error')
    })
  })

  describe('generateFromPrompt', () => {
    it('calls generate with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' }),
      })

      const result = await client.generateFromPrompt(
        { prompt: 'User content', system: 'System content' },
        'model-name',
        { temperature: 0.5 }
      )

      expect(result).toBe('Result')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('model-name')
      expect(body.prompt).toBe('User content')
      expect(body.system).toBe('System content')
      expect(body.options.temperature).toBe(0.5)
    })

    it('uses default options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' }),
      })

      await client.generateFromPrompt({ prompt: 'test' }, 'model')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.options.temperature).toBe(0.3)
      expect(body.options.num_ctx).toBe(2048)
    })
  })

  describe('generateStream', () => {
    it('yields response chunks', async () => {
      const chunks = [
        JSON.stringify({ response: 'Hello ' }),
        JSON.stringify({ response: 'world' }),
      ]

      let readIndex = 0
      const encoder = new TextEncoder()

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < chunks.length) {
                return {
                  done: false,
                  value: encoder.encode(chunks[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const results: string[] = []
      for await (const chunk of client.generateStream({
        model: 'test',
        prompt: 'test',
      })) {
        results.push(chunk)
      }

      expect(results).toEqual(['Hello ', 'world'])
    })

    it('throws when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      const generator = client.generateStream({ model: 'test', prompt: 'test' })
      await expect(generator.next()).rejects.toThrow(
        'Ollama error: 400 Bad Request'
      )
    })

    it('throws when no response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      })

      const generator = client.generateStream({ model: 'test', prompt: 'test' })
      await expect(generator.next()).rejects.toThrow('No response body')
    })

    it('skips invalid JSON lines', async () => {
      const encoder = new TextEncoder()
      let readIndex = 0
      const lines = ['invalid json', JSON.stringify({ response: 'valid' })]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const results: string[] = []
      for await (const chunk of client.generateStream({
        model: 'test',
        prompt: 'test',
      })) {
        results.push(chunk)
      }

      expect(results).toEqual(['valid'])
    })

    it('skips empty lines', async () => {
      const encoder = new TextEncoder()
      let readIndex = 0
      const lines = ['', '   ', JSON.stringify({ response: 'valid' })]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const results: string[] = []
      for await (const chunk of client.generateStream({
        model: 'test',
        prompt: 'test',
      })) {
        results.push(chunk)
      }

      expect(results).toEqual(['valid'])
    })

    it('skips JSON without response field', async () => {
      const encoder = new TextEncoder()
      let readIndex = 0
      const lines = [
        JSON.stringify({ done: false }),
        JSON.stringify({ response: 'valid' }),
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const results: string[] = []
      for await (const chunk of client.generateStream({
        model: 'test',
        prompt: 'test',
      })) {
        results.push(chunk)
      }

      expect(results).toEqual(['valid'])
    })
  })

  describe('streamFromPrompt', () => {
    it('delegates to generateStream with correct options', async () => {
      const encoder = new TextEncoder()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => ({
              done: false,
              value: encoder.encode(JSON.stringify({ response: 'test' }) + '\n'),
            }),
          }),
        },
      })

      const gen = client.streamFromPrompt(
        { prompt: 'user', system: 'system' },
        'model',
        { temperature: 0.7 }
      )

      // Get first chunk then break
      const first = await gen.next()
      expect(first.value).toBe('test')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.options.temperature).toBe(0.7)
    })

    it('uses default options when none provided', async () => {
      const encoder = new TextEncoder()
      let readCount = 0
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readCount++ === 0) {
                return {
                  done: false,
                  value: encoder.encode(JSON.stringify({ response: 'test' }) + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const gen = client.streamFromPrompt({ prompt: 'user' }, 'model')
      await gen.next()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.options.temperature).toBe(0.3)
      expect(body.options.num_ctx).toBe(2048)
    })
  })

  describe('generateJSON', () => {
    it('parses JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: '[{"key": "value"}]' }),
      })

      const result = await client.generateJSON<{ key: string }[]>(
        { prompt: 'test' },
        'model'
      )

      expect(result).toEqual([{ key: 'value' }])
    })

    it('cleans model artifacts before parsing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            response:
              '<|im_start|>assistant\n```json\n{"result": true}\n```<|im_end|>',
          }),
      })

      const result = await client.generateJSON<{ result: boolean }>(
        { prompt: 'test' },
        'model'
      )

      expect(result).toEqual({ result: true })
    })

    it('extracts JSON array from text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            response: 'Here is the array: [1, 2, 3] with some text after',
          }),
      })

      const result = await client.generateJSON<number[]>(
        { prompt: 'test' },
        'model'
      )

      expect(result).toEqual([1, 2, 3])
    })

    it('retries on parse failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ response: 'not json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ response: '{"valid": true}' }),
        })

      const result = await client.generateJSON<{ valid: boolean }>(
        { prompt: 'test' },
        'model'
      )

      expect(result).toEqual({ valid: true })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws after max retries', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'not json' }),
      })

      await expect(
        client.generateJSON({ prompt: 'test' }, 'model', 2)
      ).rejects.toThrow()

      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('handles non-Error thrown', async () => {
      mockFetch.mockRejectedValueOnce('string error')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ response: '{"valid": true}' }),
        })

      const result = await client.generateJSON<{ valid: boolean }>(
        { prompt: 'test' },
        'model'
      )

      expect(result).toEqual({ valid: true })
    })
  })

  describe('pullModel', () => {
    it('pulls model and calls onProgress', async () => {
      const encoder = new TextEncoder()
      const statuses = [
        JSON.stringify({ status: 'pulling layer 1' }),
        JSON.stringify({ status: 'pulling layer 2' }),
      ]
      let readIndex = 0

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < statuses.length) {
                return {
                  done: false,
                  value: encoder.encode(statuses[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const progressCalls: string[] = []
      await client.pullModel('test-model', status => progressCalls.push(status))

      expect(progressCalls).toEqual(['pulling layer 1', 'pulling layer 2'])
    })

    it('throws on fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(client.pullModel('invalid-model')).rejects.toThrow(
        'Failed to pull model: Not Found'
      )
    })

    it('handles no response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      })

      // Should not throw
      await client.pullModel('test-model')
    })

    it('skips empty lines in progress', async () => {
      const encoder = new TextEncoder()
      const lines = ['', '   ', JSON.stringify({ status: 'valid' })]
      let readIndex = 0

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const progressCalls: string[] = []
      await client.pullModel('test-model', status => progressCalls.push(status))

      expect(progressCalls).toEqual(['valid'])
    })

    it('skips invalid JSON in progress', async () => {
      const encoder = new TextEncoder()
      const lines = ['not json', JSON.stringify({ status: 'valid' })]
      let readIndex = 0

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const progressCalls: string[] = []
      await client.pullModel('test-model', status => progressCalls.push(status))

      expect(progressCalls).toEqual(['valid'])
    })

    it('skips JSON without status field', async () => {
      const encoder = new TextEncoder()
      const lines = [
        JSON.stringify({ other: 'data' }),
        JSON.stringify({ status: 'valid' }),
      ]
      let readIndex = 0

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIndex < lines.length) {
                return {
                  done: false,
                  value: encoder.encode(lines[readIndex++] + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      const progressCalls: string[] = []
      await client.pullModel('test-model', status => progressCalls.push(status))

      expect(progressCalls).toEqual(['valid'])
    })

    it('works without onProgress callback', async () => {
      const encoder = new TextEncoder()
      let readCount = 0
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readCount++ === 0) {
                return {
                  done: false,
                  value: encoder.encode(JSON.stringify({ status: 'test' }) + '\n'),
                }
              }
              return { done: true, value: undefined }
            },
          }),
        },
      })

      // Should not throw even without callback
      await client.pullModel('test-model')
    })
  })
})

describe('ollamaClient singleton', () => {
  it('is an OllamaClient instance', () => {
    expect(ollamaClient).toBeInstanceOf(OllamaClient)
  })

  it('uses default URL', () => {
    expect(ollamaClient.getBaseUrl()).toBe('http://localhost:11434')
  })
})
