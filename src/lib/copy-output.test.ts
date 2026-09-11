import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyOutput } from './copy-output'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'
import { notifyWindowHiddenByRuntime } from '../hooks/useWindowVisibility'

vi.mock('../i18n', () => ({
  changeLanguage: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
}))

const hide = vi.fn<() => Promise<void>>()

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ hide })),
}))

vi.mock('../hooks/useWindowVisibility', () => ({
  notifyWindowHiddenByRuntime: vi.fn(),
}))

describe('copyOutput', () => {
  beforeEach(async () => {
    localStorage.clear()
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    vi.mocked(writeText).mockReset()
    vi.mocked(writeText).mockResolvedValue(undefined)
    hide.mockReset()
    hide.mockResolvedValue(undefined)
    vi.mocked(notifyWindowHiddenByRuntime).mockClear()
    useSettingsStore.setState({ autoHideAfterCopy: false })
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes the output to the clipboard', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')

    const result = await copyOutput('Xin chào')

    expect(writeText).toHaveBeenCalledWith('Xin chào')
    expect(result.copied).toBe(true)
  })

  it('does not hide or transition visibility when auto-hide is off', async () => {
    const result = await copyOutput('Xin chào')

    expect(hide).not.toHaveBeenCalled()
    expect(notifyWindowHiddenByRuntime).not.toHaveBeenCalled()
    expect(result).toMatchObject({ copied: true, hidden: false })
  })

  it('hides the window after a successful copy when auto-hide is on', async () => {
    useSettingsStore.setState({ autoHideAfterCopy: true })

    const result = await copyOutput('Xin chào')

    expect(hide).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ copied: true, hidden: true })
  })

  it('writes to the clipboard before hiding the window', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    const order: string[] = []
    vi.mocked(writeText).mockImplementation(async () => {
      order.push('clipboard')
    })
    hide.mockImplementation(async () => {
      order.push('hide')
    })
    useSettingsStore.setState({ autoHideAfterCopy: true })

    await copyOutput('Xin chào')

    expect(order).toEqual(['clipboard', 'hide'])
  })

  it('transitions visibility only after the native hide resolves', async () => {
    const order: string[] = []
    hide.mockImplementation(async () => {
      order.push('hide')
    })
    vi.mocked(notifyWindowHiddenByRuntime).mockImplementation(() => {
      order.push('notify')
    })
    useSettingsStore.setState({ autoHideAfterCopy: true })

    await copyOutput('Xin chào')

    expect(order).toEqual(['hide', 'notify'])
  })

  it('does not hide or notify when the clipboard write fails', async () => {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    vi.mocked(writeText).mockRejectedValue(new Error('clipboard unavailable'))
    useSettingsStore.setState({ autoHideAfterCopy: true })

    const result = await copyOutput('Xin chào')

    expect(result.copied).toBe(false)
    expect(hide).not.toHaveBeenCalled()
    expect(notifyWindowHiddenByRuntime).not.toHaveBeenCalled()
  })

  it('keeps the copy successful and reports the failure when hiding fails', async () => {
    hide.mockRejectedValue(new Error('hide denied'))
    useSettingsStore.setState({ autoHideAfterCopy: true })

    const result = await copyOutput('Xin chào')

    expect(result).toMatchObject({ copied: true, hidden: false })
    expect(
      useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError
    ).toContain('hide denied')
    expect(notifyWindowHiddenByRuntime).not.toHaveBeenCalled()
  })

  it('clears a previous hide failure after a later hide succeeds', async () => {
    useDesktopRuntimeStatusStore.getState().setAutoHideAfterCopyError('hide denied')
    useSettingsStore.setState({ autoHideAfterCopy: true })

    await copyOutput('Xin chào')

    expect(useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError).toBeNull()
  })

  it('leaves a hide failure in place when the next copy does not hide', async () => {
    useDesktopRuntimeStatusStore.getState().setAutoHideAfterCopyError('hide denied')

    await copyOutput('Xin chào')

    expect(useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError).toBe('hide denied')
  })

  it('does not cancel speech itself; visibility owns that cleanup', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    useSettingsStore.setState({ autoHideAfterCopy: true })

    await copyOutput('Xin chào')

    expect(invoke).not.toHaveBeenCalled()
    expect(notifyWindowHiddenByRuntime).toHaveBeenCalledTimes(1)
  })
})
