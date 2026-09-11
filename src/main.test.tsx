import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode, type ReactElement } from 'react'

const { createRootMock, renderMock, unmountMock, AppMock } = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  renderMock: vi.fn(),
  unmountMock: vi.fn(),
  AppMock: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  default: { createRoot: createRootMock },
  createRoot: createRootMock,
}))

// App has its own behavior suite; the bootstrap only has to hand it over.
vi.mock('./App', () => ({ default: AppMock }))

// Bootstrapping must not depend on a real localization runtime.
vi.mock('./i18n', () => ({
  default: {},
  changeLanguage: vi.fn(),
  getCurrentLanguage: vi.fn(),
  UI_LANGUAGES: [],
}))

function renderedElement(): ReactElement<{ children: ReactElement }> {
  return renderMock.mock.calls[0][0]
}

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    createRootMock.mockReturnValue({ render: renderMock, unmount: unmountMock })
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('mounts into the live #root element', async () => {
    await import('./main')

    const root = document.getElementById('root')
    expect(createRootMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledWith(root)
    expect(document.body.contains(createRootMock.mock.calls[0][0])).toBe(true)
  })

  it('renders exactly once', async () => {
    await import('./main')

    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('renders inside React.StrictMode', async () => {
    await import('./main')

    expect(renderedElement().type).toBe(StrictMode)
  })

  it('renders App as the StrictMode child', async () => {
    await import('./main')

    expect(renderedElement().props.children.type).toBe(AppMock)
  })

  it('resolves the root element at bootstrap time, not from a stale reference', async () => {
    await import('./main')
    const firstRoot = createRootMock.mock.calls[0][0]

    vi.resetModules()
    createRootMock.mockClear()
    document.body.innerHTML = '<div id="root"></div>'
    const secondRoot = document.getElementById('root')

    await import('./main')

    expect(secondRoot).not.toBe(firstRoot)
    expect(createRootMock).toHaveBeenCalledWith(secondRoot)
  })
})
