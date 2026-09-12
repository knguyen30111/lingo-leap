import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorInputPanel } from './editor-input-panel'
import { useAppStore } from '../../stores/appStore'
import { useSettingsStore } from '../../stores/settingsStore'

const PLACEHOLDER = 'Enter text to translate...'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        chars: 'chars',
        voiceInput: 'Voice input',
        stopListening: 'Stop listening',
      }
      return translations[key] || key
    },
  }),
}))

// The real MicButton, SpeechPreview and ClearInputButton are used deliberately: the view
// tests already cover the mocked composition, so these cover the real accessible names.
let capturedOnTextReady: ((text: string) => void) | undefined
let capturedLang: string | undefined
const speechState = {
  isListening: false,
  isSupported: true,
  transcript: '',
  interimTranscript: '',
  silenceDetected: false,
  error: null as string | null,
}
const mockToggleListening = vi.fn()
vi.mock('../../hooks/useSpeechToText', () => ({
  useSpeechToText: (options?: { lang?: string; onTextReady?: (text: string) => void }) => {
    capturedOnTextReady = options?.onTextReady
    capturedLang = options?.lang
    return {
      ...speechState,
      startListening: vi.fn(),
      stopListening: vi.fn(),
      toggleListening: mockToggleListening,
      clearTranscript: vi.fn(),
    }
  },
}))

type PanelProps = Parameters<typeof EditorInputPanel>[0]

function propsFor(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    className: 'flex-1 flex flex-col glass-card overflow-hidden relative',
    value: '',
    onChange: () => {},
    onClear: () => {},
    onSubmit: () => {},
    placeholder: PLACEHOLDER,
    speechDisabled: false,
    ...overrides,
  }
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props = propsFor(overrides)
  const utils = render(<EditorInputPanel {...props} />)
  return {
    ...utils,
    rerenderWith: (next: Partial<PanelProps>) =>
      utils.rerender(<EditorInputPanel {...props} {...next} />),
  }
}

// The preview is the only surface that shows what the hook heard, so its props are asserted
// through the DOM the real SpeechPreview renders: the visible flag, which of transcript and
// interimTranscript wins, and the empty/final distinction between them. Class sets are
// compared exactly, so a dropped or hard-coded prop cannot hide behind a superset.
function speechPreview(): HTMLElement {
  return screen.getByRole('status')
}

function previewText(): HTMLElement {
  return speechPreview().firstElementChild as HTMLElement
}

function expectPreviewAccessibility(preview: HTMLElement) {
  expect(preview).toHaveAttribute('aria-live', 'polite')
  expect(preview).toHaveAttribute('aria-atomic', 'true')

  const status = preview.children[1]
  expect(status).toHaveClass('speech-preview-status', { exact: true })
  expect(status.children[0]).toHaveClass('listening-dot', { exact: true })
  expect(status.children[0]).toHaveAttribute('aria-hidden', 'true')
  expect(status.children[1]).toHaveTextContent('Listening...')
  expect(status.children[2]).toHaveClass('speech-preview-hint', { exact: true })
  expect(status.children[2]).toHaveTextContent('Click mic to stop')
}

beforeEach(() => {
  useAppStore.setState({ inputText: '' })
  useSettingsStore.setState({ speechLang: 'en' })
  mockToggleListening.mockClear()
  capturedLang = undefined
  capturedOnTextReady = undefined
  Object.assign(speechState, {
    isListening: false,
    isSupported: true,
    transcript: '',
    interimTranscript: '',
    silenceDetected: false,
    error: null,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EditorInputPanel textarea', () => {
  it('renders the value in the textarea', () => {
    renderPanel({ value: 'Hello' })

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('Hello')
  })

  it('reports textarea changes through onChange', () => {
    const onChange = vi.fn()
    renderPanel({ onChange })

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: 'Hello world' },
    })

    expect(onChange).toHaveBeenCalledWith('Hello world')
  })
})

describe('EditorInputPanel keyboard', () => {
  it('calls onSubmit on Cmd+Enter and prevents default', () => {
    const onSubmit = vi.fn()
    renderPanel({ value: 'Hello', onSubmit })

    const notPrevented = fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER), {
      key: 'Enter',
      metaKey: true,
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('calls onSubmit on Ctrl+Enter and prevents default', () => {
    const onSubmit = vi.fn()
    renderPanel({ value: 'Hello', onSubmit })

    const notPrevented = fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER), {
      key: 'Enter',
      ctrlKey: true,
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
  })

  it('does not call onSubmit on bare Enter', () => {
    const onSubmit = vi.fn()
    renderPanel({ value: 'Hello', onSubmit })

    fireEvent.keyDown(screen.getByPlaceholderText(PLACEHOLDER), { key: 'Enter' })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('EditorInputPanel clear control', () => {
  it('renders the clear control when the value is non-empty', () => {
    renderPanel({ value: 'Hello' })

    expect(screen.getByTitle('Clear input')).toBeInTheDocument()
  })

  it('hides the clear control when the value is empty', () => {
    renderPanel({ value: '' })

    expect(screen.queryByTitle('Clear input')).not.toBeInTheDocument()
  })

  it('calls onClear when the clear control is activated', () => {
    const onClear = vi.fn()
    renderPanel({ value: 'Hello', onClear })

    fireEvent.click(screen.getByTitle('Clear input'))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('labels the clear control for assistive technology', () => {
    renderPanel({ value: 'Hello' })

    expect(screen.getByTitle('Clear input')).toHaveAttribute('aria-label', 'Clear input text')
  })
})

describe('EditorInputPanel char count', () => {
  it('renders the character count', () => {
    renderPanel({ value: 'Hello' })

    expect(screen.getByText('5 chars')).toBeInTheDocument()
  })
})

describe('EditorInputPanel speech controls', () => {
  it('labels the speech language select and renders the idle speech preview', () => {
    renderPanel()

    expect(screen.getByTitle('Speech language')).toHaveAttribute('aria-label', 'Speech language')

    // Not listening, nothing heard: the preview stays mounted and hidden, and says so.
    const preview = speechPreview()
    expect(preview).toHaveClass('speech-preview', { exact: true })
    expect(previewText()).toHaveClass('speech-preview-text empty', { exact: true })
    expect(previewText()).toHaveTextContent('Start speaking...')
    expectPreviewAccessibility(preview)
    expect(screen.getByLabelText('Voice input')).toHaveClass('mic-button', { exact: true })
    expect(screen.getByLabelText('Voice input')).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides the speech language select when speech is unsupported', () => {
    speechState.isSupported = false
    renderPanel()

    expect(screen.queryByTitle('Speech language')).not.toBeInTheDocument()
  })

  it('hides the mic when speech is unsupported', () => {
    speechState.isSupported = false
    renderPanel()

    expect(screen.queryByLabelText('Voice input')).not.toBeInTheDocument()
  })

  it('disables the mic when speechDisabled and still reflects detected silence', () => {
    const { rerenderWith } = renderPanel({ speechDisabled: true })

    expect(screen.getByLabelText('Voice input')).toBeDisabled()

    speechState.isListening = true
    speechState.silenceDetected = true
    rerenderWith({})

    // Silence is the hook's signal and reaches the mic as its own class, independently of
    // the listening class and of the disabled state.
    const mic = screen.getByLabelText('Stop listening')
    expect(mic).toHaveClass('mic-button listening silence-detected', { exact: true })
    expect(mic).toBeDisabled()
    expect(speechPreview()).toHaveClass('speech-preview visible', { exact: true })
  })

  it('routes a mic click to toggleListening and reflects the listening state', () => {
    const { rerenderWith } = renderPanel()

    fireEvent.click(screen.getByLabelText('Voice input'))

    expect(mockToggleListening).toHaveBeenCalledTimes(1)

    speechState.isListening = true
    rerenderWith({})

    const mic = screen.getByLabelText('Stop listening')
    expect(mic).toHaveClass('mic-button listening', { exact: true })
    expect(mic).toHaveAttribute('aria-pressed', 'true')
    expect(mic).toHaveAttribute('title', 'Stop listening')
    // Listening with nothing heard yet: visible, still the empty placeholder.
    expect(speechPreview()).toHaveClass('speech-preview visible', { exact: true })
    expect(previewText()).toHaveClass('speech-preview-text empty', { exact: true })
    expect(previewText()).toHaveTextContent('Start speaking...')
  })

  it('passes the current speech language to useSpeechToText', () => {
    useSettingsStore.setState({ speechLang: 'ja' })
    renderPanel()

    expect(capturedLang).toBe('ja')
  })

  it('stores a new speech language selection', () => {
    renderPanel()

    fireEvent.change(screen.getByTitle('Speech language'), { target: { value: 'ko' } })

    expect(useSettingsStore.getState().speechLang).toBe('ko')
  })
})

describe('EditorInputPanel speech append', () => {
  it('previews a final transcript and appends it to an empty input without a leading space', () => {
    const onChange = vi.fn()
    useAppStore.setState({ inputText: '' })
    speechState.isListening = true
    speechState.transcript = 'hello there'
    renderPanel({ value: '', onChange })

    // A transcript with no interim text behind it is final, and the preview says so.
    expect(previewText()).toHaveClass('speech-preview-text final', { exact: true })
    expect(previewText()).toHaveTextContent('hello there')

    act(() => {
      capturedOnTextReady?.('Hello')
    })

    expect(onChange).toHaveBeenCalledWith('Hello')
  })

  it('previews the interim transcript and appends with one separating space', () => {
    const onChange = vi.fn()
    useAppStore.setState({ inputText: 'Hello' })
    speechState.isListening = true
    speechState.transcript = 'hello there'
    speechState.interimTranscript = 'and a bit more'
    renderPanel({ value: 'Hello', onChange })

    // Interim text wins over the settled transcript while it exists, and is not final.
    expect(previewText()).toHaveTextContent('and a bit more')
    expect(previewText()).toHaveClass('speech-preview-text', { exact: true })

    act(() => {
      capturedOnTextReady?.('world')
    })

    expect(onChange).toHaveBeenCalledWith('Hello world')
  })
})

describe('EditorInputPanel speech error', () => {
  it('renders exactly one alert for a speech error', () => {
    speechState.error = 'Microphone access denied'
    renderPanel()

    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent('Microphone access denied')
  })
})

describe('EditorInputPanel header', () => {
  it('renders the header above the textarea when supplied', () => {
    renderPanel({ value: 'Hello', header: <div data-testid="test-header">Header</div> })

    const header = screen.getByTestId('test-header')
    const textarea = screen.getByPlaceholderText(PLACEHOLDER)

    // compareDocumentPosition rather than sibling identity, so the assertion is about
    // ordering alone and stays insensitive to whether the clear control sits between them.
    expect(
      header.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('renders nothing extra when no header is supplied', () => {
    const { container } = renderPanel({ value: '' })
    const textarea = screen.getByPlaceholderText(PLACEHOLDER)
    const panel = container.firstElementChild as HTMLElement

    const beforeTextarea = Array.from(panel.children).filter(
      (el) => el.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING
    )
    const notTheClearControl = beforeTextarea.filter(
      (el) => el.getAttribute('aria-label') !== 'Clear input text'
    )

    expect(notTheClearControl).toHaveLength(0)
  })
})

describe('EditorInputPanel focus', () => {
  it('keeps focus on the textarea across a chord submit', () => {
    renderPanel({ value: 'Hello' })
    const textarea = screen.getByPlaceholderText(PLACEHOLDER)
    textarea.focus()
    expect(document.activeElement).toBe(textarea)

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    expect(document.activeElement).toBe(textarea)
  })

  it('moves focus to the clear control on press and to the body once it unmounts', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const { rerenderWith } = renderPanel({ value: 'Hello', onClear })
    const textarea = screen.getByPlaceholderText(PLACEHOLDER)
    textarea.focus()
    expect(document.activeElement).toBe(textarea)

    // Real pointer activation against the real ClearInputButton. A press focuses the
    // control, so the press and the release are issued separately: the press-time focus
    // target can only be read while the control is still mounted. The same sequence was
    // measured on the pre-refactor views at base 60ea115.
    const clear = screen.getByTitle('Clear input')
    await user.pointer({ target: clear, keys: '[MouseLeft>]' })
    expect(document.activeElement).toBe(clear)

    await user.pointer({ target: clear, keys: '[/MouseLeft]' })
    expect(onClear).toHaveBeenCalledTimes(1)
    rerenderWith({ value: '' })

    // The focused control left the document, so focus falls to the body. The panel does
    // not refocus the textarea, and this suite must not claim it does.
    expect(screen.queryByTitle('Clear input')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(document.body)
    expect(document.activeElement).not.toBe(textarea)
    // The textarea is not remounted by the clear: same node, emptied in place.
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBe(textarea)
    expect(textarea).toHaveValue('')
  })
})
