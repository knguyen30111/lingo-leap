import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useSettingsStore } from '../stores/settingsStore'
import { useDesktopRuntimeStatusStore } from '../stores/desktop-runtime-status-store'
import { notifyWindowHiddenByRuntime } from '../hooks/useWindowVisibility'

export interface CopyOutputResult {
  /** The clipboard holds the output. This is what "Copied" means. */
  copied: boolean
  /** The window is actually hidden, so visibility has moved on. */
  hidden: boolean
  copyError?: unknown
  hideError?: unknown
}

function reasonOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : `${fallback}: ${String(err)}`
}

/**
 * Copy generated output, then honour the auto-hide preference.
 *
 * Hiding is a reward for a copy that worked: a window that disappears without
 * putting anything on the clipboard loses the text the user asked for. The
 * visibility abstraction is told only once the window is really gone, because
 * that notification is what releases the speech session.
 */
export async function copyOutput(text: string): Promise<CopyOutputResult> {
  try {
    await writeText(text)
  } catch (err) {
    return { copied: false, hidden: false, copyError: err }
  }

  if (!useSettingsStore.getState().autoHideAfterCopy) {
    return { copied: true, hidden: false }
  }

  const status = useDesktopRuntimeStatusStore.getState()
  try {
    await getCurrentWindow().hide()
  } catch (err) {
    status.setAutoHideAfterCopyError(reasonOf(err, 'Could not hide the window'))
    return { copied: true, hidden: false, hideError: err }
  }

  status.clearAutoHideAfterCopyError()
  notifyWindowHiddenByRuntime()
  return { copied: true, hidden: true }
}
