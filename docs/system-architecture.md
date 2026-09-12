# System architecture

How Lingo Leap is put together, as it actually ships. Machine-readable details are linked rather than
restated, because prose copies drift.

## Two processes

| Process | What it is | What it owns |
|---|---|---|
| **Tauri Rust host** | the native process, `Contents/MacOS/tran-app` | the window lifecycle, the tray icon and menu, the macOS audio session, and the two custom commands below |
| **WKWebView frontend** | React + TypeScript, built by Vite | the entire user interface, the prompt construction, the Ollama HTTP client, and all application state |

They communicate over Tauri's IPC. The frontend calls native functionality in exactly two ways: the
plugin commands the capability file permits, and the two commands this app defines itself.

The bundled executable is named **`tran-app`**, from `[package].name` in `src-tauri/Cargo.toml`. The
product name `Lingo Leap` names the `.app` and the DMG, not the binary.

## The native authority surface

The frontend holds five permissions, listed in
[`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json), which is the
machine-readable authority:

| Permission | Why it exists |
|---|---|
| `core:event:allow-listen` | `useWindowVisibility` subscribes to the window close request and to `tauri://window-created` |
| `core:event:allow-unlisten` | releasing those subscriptions on unmount |
| `core:window:allow-set-always-on-top` | the Always On Top setting |
| `core:window:allow-hide` | hiding the window after an auto-hide copy |
| `clipboard-manager:allow-write-text` | copying the output |

Plus two commands the app defines itself, in `src-tauri/src/audio_session.rs` and registered in
`src-tauri/src/lib.rs`. Commands an app defines are not ACL-gated:

- `activate_voice_session`
- `deactivate_voice_session`

Nothing else is granted. In particular the app holds no shell, global-shortcut, positioner, or
clipboard-read authority, and the corresponding plugins are not compiled in.

The Ollama endpoint is reachable from **two** screens, not one. The settings panel owns it in normal
use, and the setup wizard carries the same field because the wizard is what the shell renders
whenever the configured endpoint does not answer — `App` routes on `ollamaInstalled`, which the
Ollama runtime clears on every failed check. Without the field there, a persisted unreachable host
would leave no screen able to correct it.

Window destruction is **not** granted, and the frontend does not request it: the close handler calls
`preventDefault()` and the Rust host hides the window and calls `prevent_close()` instead. Closing the
window leaves the app running in the tray.

## The webview boundary

The Content Security Policy is `app.security.csp` in
[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json). It permits scripts, styles, and fonts
only from the bundle, images from the bundle plus `data:` URIs, and connections to Tauri's IPC
origins plus `http:`/`https:` for the configured Ollama endpoint. Media, workers, objects, frames,
and form actions are all closed, and `base-uri` is pinned.

`app.security.devCsp` is explicitly `null`: a development CSP is out of scope, and stating it stops
the production policy applying to `tauri:dev` as an unstated side effect.

## Data flow

```
input text
  └─> prompt builder        (src/lib/prompt-builder.ts)
        └─> Ollama client   (src/lib/ollama-client.ts)  ──HTTP──> configured Ollama endpoint
              └─> model output
                    └─> cleaner (src/lib/model.ts)
                          └─> view
```

Correction runs a **second, separate round trip** to extract the individual changes: the corrected
text and the original are composed into an extraction prompt, the model answers with JSON, and the
result populates the changes panel. When that answer is unusable, the service falls back to a single
whole-text change rather than retrying.

Neither path writes user text, model output, or a raw error to the console.

## The macOS audio session

`src-tauri/src/audio_session.rs` exists because of a platform behavior rather than a feature
requirement. Activating the microphone switches macOS to a voice-chat audio profile, which
noticeably degrades system audio output until the session is deactivated. The module configures
`AVAudioSessionCategoryPlayAndRecord` on activation and releases the session on deactivation, so
stopping dictation restores normal audio quality.

The module is the only place in the crate with unsafe code — `objc` message sends into signed system
frameworks.

## Signing and hardening posture

- **Ad-hoc signature** (`signingIdentity: "-"`). No Developer ID, no team identifier.
- **Hardened Runtime in force**, set explicitly as `bundle.macOS.hardenedRuntime`. A built bundle
  reports code-directory flags `adhoc,runtime`.
- **No App Sandbox.**
- **One entitlement**, in [`src-tauri/Entitlements.plist`](../src-tauri/Entitlements.plist):
  `com.apple.security.device.audio-input`.

The Hardened Runtime is what makes that single-entitlement set meaningful rather than decorative.
Under a hardened runtime, the absence of an exception is enforced; without it, removing exceptions
would be a tidiness change. The JIT and unsigned-executable-memory exceptions were removed from a
bundle that runs hardened, and the bundle still loads its webview and runs its JavaScript — because
WebKit's JIT lives in a separate, system-signed process that carries its own entitlements.

The `bundle.macOS` block in `tauri.conf.json` is the authority for all of the above.

## State

- **Zustand stores** hold application and settings state.
- **Settings persist** in the webview's local storage under the key `tran-app-settings`, with a
  versioned migration contract. Migration is fail-closed: a payload from a newer version than the
  running app understands is refused rather than downgraded, and a malformed payload is refused
  rather than partially applied.
- **The selected interface language persists separately**, under `tran-app-ui-language`, because the
  i18next language detector owns that key. Both keys are listed in
  [privacy.md](privacy.md).
- **The response cache is in memory only**, and an entry additionally expires after 30 minutes. It
  does not survive a restart.
- **The visible version has one authority.** The build injects `package.json`'s `version` as
  `__APP_VERSION__`, `src/lib/app-version.ts` re-exports it, and the locale files carry a
  `{{version}}` placeholder rather than a literal, so no translation can pin a stale version.

## Deliberately absent

- No telemetry.
- No crash reporting.
- No automatic updater and no update feed.
- No background service or daemon.
- No account, sign-in, or server-side component of any kind.

## Known naming debt

The Rust crate is still `tran-app` (library `tran_app_lib`), left over from before the project was
renamed to Lingo Leap. Renaming it would touch the manifest, the lockfile, the entry point, and every
build path for no security or honesty benefit, so it is recorded here rather than changed.

The bundle identifier `com.lingoleap.translator` **must stay stable**. Changing it would orphan every
existing install's persisted settings, since the webview's local storage is scoped to it.
