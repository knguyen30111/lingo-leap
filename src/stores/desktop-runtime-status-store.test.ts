import { describe, it, expect, beforeEach } from 'vitest'
import { useDesktopRuntimeStatusStore } from './desktop-runtime-status-store'

describe('desktopRuntimeStatusStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useDesktopRuntimeStatusStore.setState({
      alwaysOnTopApplyError: null,
      autoHideAfterCopyError: null,
    })
  })

  it('starts with no desktop runtime errors', () => {
    const state = useDesktopRuntimeStatusStore.getState()
    expect(state.alwaysOnTopApplyError).toBeNull()
    expect(state.autoHideAfterCopyError).toBeNull()
  })

  it('records and clears an always-on-top apply failure', () => {
    useDesktopRuntimeStatusStore.getState().setAlwaysOnTopApplyError('denied by platform')
    expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBe(
      'denied by platform'
    )

    useDesktopRuntimeStatusStore.getState().clearAlwaysOnTopApplyError()
    expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
  })

  it('records and clears an auto-hide failure', () => {
    useDesktopRuntimeStatusStore.getState().setAutoHideAfterCopyError('hide unavailable')
    expect(useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError).toBe(
      'hide unavailable'
    )

    useDesktopRuntimeStatusStore.getState().clearAutoHideAfterCopyError()
    expect(useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError).toBeNull()
  })

  it('keeps the two desktop failures independent', () => {
    useDesktopRuntimeStatusStore.getState().setAlwaysOnTopApplyError('pin failed')
    useDesktopRuntimeStatusStore.getState().setAutoHideAfterCopyError('hide failed')

    useDesktopRuntimeStatusStore.getState().clearAlwaysOnTopApplyError()

    expect(useDesktopRuntimeStatusStore.getState().alwaysOnTopApplyError).toBeNull()
    expect(useDesktopRuntimeStatusStore.getState().autoHideAfterCopyError).toBe('hide failed')
  })

  it('is operational truth only, never written to persisted settings', () => {
    useDesktopRuntimeStatusStore.getState().setAlwaysOnTopApplyError('pin failed')
    useDesktopRuntimeStatusStore.getState().setAutoHideAfterCopyError('hide failed')

    expect(useDesktopRuntimeStatusStore).not.toHaveProperty('persist')
    expect(localStorage.getItem('tran-app-settings')).toBeNull()
  })
})
