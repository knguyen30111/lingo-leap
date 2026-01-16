/**
 * Whisper-based Speech-to-Text for Linux
 *
 * WebKitGTK doesn't support Web Speech API, so we use Whisper as a fallback.
 * This hook records audio via Web Audio API and sends it to the Tauri backend
 * for transcription using whisper.cpp.
 */

import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface UseWhisperSTTOptions {
  lang?: string
  onTextReady?: (text: string) => void
  onEnd?: () => void
  onError?: (error: string) => void
}

export interface UseWhisperSTTReturn {
  isListening: boolean
  isSupported: boolean
  isProcessing: boolean
  error: string | null
  startListening: () => Promise<void>
  stopListening: () => Promise<void>
  toggleListening: () => Promise<void>
}

// Check if Whisper is available (cached result)
let whisperAvailable: boolean | null = null

async function checkWhisperSupport(): Promise<boolean> {
  if (whisperAvailable !== null) return whisperAvailable

  try {
    whisperAvailable = await invoke<boolean>('check_whisper_available')
  } catch {
    whisperAvailable = false
  }
  return whisperAvailable
}

// Convert AudioBuffer to WAV format
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1 // Mono for speech
  const sampleRate = 16000 // Whisper prefers 16kHz
  const bitsPerSample = 16

  // Resample to 16kHz mono
  const offlineCtx = new OfflineAudioContext(1, buffer.duration * sampleRate, sampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = buffer

  // Create a new buffer with the target sample rate
  const length = Math.ceil(buffer.duration * sampleRate)
  const samples = new Float32Array(length)

  // Simple linear interpolation resampling
  const ratio = buffer.sampleRate / sampleRate
  const inputData = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const srcIndex = i * ratio
    const srcIndexFloor = Math.floor(srcIndex)
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1)
    const t = srcIndex - srcIndexFloor
    samples[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t
  }

  // Convert to 16-bit PCM
  const dataLength = samples.length * 2
  const buffer2 = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer2)

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size
  view.setUint16(20, 1, true) // AudioFormat (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true) // ByteRate
  view.setUint16(32, numChannels * bitsPerSample / 8, true) // BlockAlign
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  // Write samples
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return buffer2
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function useWhisperSTT(options: UseWhisperSTTOptions = {}): UseWhisperSTTReturn {
  const { lang = 'en', onTextReady, onEnd, onError } = options

  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Check support on first use
  const ensureSupport = useCallback(async (): Promise<boolean> => {
    const supported = await checkWhisperSupport()
    setIsSupported(supported)
    return supported
  }, [])

  const startListening = useCallback(async () => {
    if (isListening || isProcessing) return

    setError(null)

    // Check Whisper support
    const supported = await ensureSupport()
    if (!supported) {
      const msg = 'Whisper not installed. Run: sudo apt install whisper.cpp'
      setError(msg)
      onError?.(msg)
      return
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })

      streamRef.current = stream
      audioChunksRef.current = []

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false)
        setIsProcessing(true)

        try {
          // Combine audio chunks
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })

          // Convert to AudioBuffer
          const arrayBuffer = await audioBlob.arrayBuffer()
          const audioContext = new AudioContext({ sampleRate: 16000 })
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
          await audioContext.close()

          // Convert to WAV
          const wavBuffer = audioBufferToWav(audioBuffer)
          const base64Audio = arrayBufferToBase64(wavBuffer)

          // Send to Whisper backend
          const transcript = await invoke<string>('transcribe_audio', {
            audioData: base64Audio,
            language: lang,
          })

          if (transcript) {
            onTextReady?.(transcript)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Transcription failed'
          setError(msg)
          onError?.(msg)
        } finally {
          setIsProcessing(false)
          onEnd?.()
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000) // Collect data every second
      setIsListening(true)

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to access microphone'
      setError(msg)
      onError?.(msg)
    }
  }, [isListening, isProcessing, lang, ensureSupport, onTextReady, onEnd, onError])

  const stopListening = useCallback(async () => {
    if (!isListening) return

    // Stop MediaRecorder (triggers onstop which processes audio)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [isListening])

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  return {
    isListening,
    isSupported,
    isProcessing,
    error,
    startListening,
    stopListening,
    toggleListening,
  }
}
