import { create } from 'zustand'

/**
 * Operational truth about the desktop settings the app applies at runtime.
 *
 * A saved preference says what the user wants; this store says what the
 * platform actually did with it. The two must stay separate, so nothing here
 * is persisted: a window manager that refused a request last session should
 * not still be reported as failing after a restart.
 */
interface DesktopRuntimeStatusState {
  alwaysOnTopApplyError: string | null
  setAlwaysOnTopApplyError: (reason: string) => void
  clearAlwaysOnTopApplyError: () => void

  autoHideAfterCopyError: string | null
  setAutoHideAfterCopyError: (reason: string) => void
  clearAutoHideAfterCopyError: () => void
}

export const useDesktopRuntimeStatusStore = create<DesktopRuntimeStatusState>((set) => ({
  alwaysOnTopApplyError: null,
  setAlwaysOnTopApplyError: (reason) => set({ alwaysOnTopApplyError: reason }),
  clearAlwaysOnTopApplyError: () => set({ alwaysOnTopApplyError: null }),

  autoHideAfterCopyError: null,
  setAutoHideAfterCopyError: (reason) => set({ autoHideAfterCopyError: reason }),
  clearAutoHideAfterCopyError: () => set({ autoHideAfterCopyError: null }),
}))
