import { useState, useCallback, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSettingsStore } from "../stores/settingsStore";

interface UpdateProgress {
  downloaded: number;
  total: number;
}

export function useAppUpdater() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { autoCheckUpdates } = useSettingsStore();

  const checkForUpdate = useCallback(async (silent = false) => {
    setChecking(true);
    setError(null);

    try {
      const result = await check();
      setUpdate(result);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to check for updates";
      // Only show error if not silent (manual check)
      if (!silent) {
        setError(errorMsg);
      }
      console.error("Update check failed:", errorMsg);
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;

    setDownloading(true);
    setError(null);
    setProgress({ downloaded: 0, total: 0 });

    try {
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setProgress({ downloaded: 0, total: event.data.contentLength || 0 });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress({ downloaded, total: event.data.contentLength || downloaded });
            break;
          case "Finished":
            setDownloading(false);
            setInstalling(true);
            break;
        }
      });

      // Relaunch app after install
      await relaunch();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to install update";
      setError(errorMsg);
      console.error("Update install failed:", errorMsg);
    } finally {
      setDownloading(false);
      setInstalling(false);
      setProgress(null);
    }
  }, [update]);

  const dismissUpdate = useCallback(() => {
    setUpdate(null);
    setError(null);
  }, []);

  // Auto-check on mount if enabled
  useEffect(() => {
    if (autoCheckUpdates) {
      // Delay check to not slow down app startup
      const timer = setTimeout(() => {
        checkForUpdate(true); // silent check
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [autoCheckUpdates, checkForUpdate]);

  const progressPercent = progress
    ? progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0
    : 0;

  return {
    checking,
    downloading,
    installing,
    progress,
    progressPercent,
    update,
    error,
    checkForUpdate,
    downloadAndInstall,
    dismissUpdate,
  };
}
