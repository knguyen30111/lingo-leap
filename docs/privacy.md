# Privacy

What leaves your machine, what stays on it, and what this project does not control.

## Translation and correction text

Text you submit for translation or correction is sent to the **configured Ollama endpoint**.

- The default is `http://localhost:11434`. With the default, the text never leaves your machine.
- The endpoint is **user-configurable**. If you point it at a remote host, the text you are
  translating or correcting is sent to that host over the network.

The Content Security Policy permits `http:` and `https:` in `connect-src` precisely so that
configuration keeps working. Narrowing it to loopback would silently break every user who has already
set a remote host.

Correction makes a **second** request to the same endpoint to extract the individual changes, and
that request includes both your original text and the corrected text.

## Speech recognition

The microphone feature uses the **Web Speech API** provided by the browser engine and the operating
system.

That implementation **may send captured audio to a network service the platform chooses**. Which
service, whether it is used at all, and what it retains are decided by the platform, are outside this
project's control, and are independent of the Ollama endpoint you configure here. Speech input always
uses the system default microphone.

## Two different kinds of outbound destination

These are not the same kind of thing, and treating them as one would overstate how much control you
have:

1. **The Ollama endpoint you configured.** Loopback by default, whatever host you set otherwise.
   Fully under your control. It receives the text being translated or corrected.
2. **Whatever network service the platform's speech recognition uses.** Not configured by you, not
   chosen by this app, and not disclosed by the platform. The app can neither enumerate nor prevent
   it. If you do not want that, do not use the microphone feature.

## What this app does not do

- **No analytics.**
- **No telemetry.**
- **No crash reporting.**
- **No remote logging.**
- **No account and no sign-in.** There is no server-side component belonging to this project.

No user text, model output, or built prompt is written to the developer console either. Failure paths
log a fixed, content-free string, so opening the webview console does not expose what you were
translating.

## What is stored locally

| Data | Where | Lifetime |
|---|---|---|
| Settings — endpoint, models, language, theme, toggles | the webview's local storage, key `tran-app-settings` | until you change or clear them |
| Selected interface language | the webview's local storage, key `tran-app-ui-language`, written by the language detector so the choice survives a restart | until you change or clear it |
| Response cache — the model's answers, keyed by a digest | memory only | up to **30 minutes** per entry, or until the app exits, whichever comes first |

Two details about the cache are worth being exact about, because "in memory only" alone would
understate its lifetime and overstate its contents:

- An entry is served for at most **30 minutes** and is then discarded on the next read. The store
  holds at most 100 entries and evicts the least recently used one beyond that. Quitting the app
  discards everything.
- The **cache key is a SHA-256 digest**, not your text: the endpoint, model, languages, level, and
  the input are hashed together, and only the digest is kept as a key. The cached **value** is the
  model's answer, so answers — not prompts — are what sits in memory for those 30 minutes.

Nothing is written to a cloud sync service by this app, and nothing above is written to disk outside
the webview's own local storage.

## Permissions the app requests

The app declares exactly one macOS entitlement:

- `com.apple.security.device.audio-input` — microphone access, for speech input.

macOS prompts for microphone access the first time you use the feature; the app cannot record without
that consent. No camera, location, contacts, calendar, or full-disk access is requested.

The native permission surface is five Tauri permissions plus two audio commands the app defines
itself. See [system-architecture.md](system-architecture.md) for the list and
[`../src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) for the
authoritative file.

## Reporting a privacy or security concern

See [SECURITY.md](../SECURITY.md).
