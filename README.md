# Lingo Leap

Local-AI translation and grammar correction app powered by Ollama. Available for **macOS**.

<p align="center">
  <img src="assets/logo.png" alt="Lingo Leap" width="200">
</p>

## Features

- **Translation Mode** - Translate text between languages with auto-detection
- **Correction Mode** - Fix grammar and spelling with three intensity levels:
  - Light: Minor fixes only
  - Medium: Grammar and style improvements
  - Heavy: Full rewrite for clarity
- **Speech-to-Text** - Voice input with continuous recording and silence detection. Recognition is
  provided by the browser and platform (Web Speech API), may use a network service, and always
  listens through the system default microphone
- **Language Swap** - One-click swap between source and target languages
- **Local AI** - Translation and grammar correction run locally via Ollama
- **Liquid Glass UI** - Modern design with light/dark/system themes
- **Refined Settings** - Organized settings panel with grouped sections
- **Menu Bar Integration** - Quick access from system tray
- **Streaming Responses** - See results as they generate
- **Smart Caching** - Instant results for repeated queries
- **Keyboard Shortcuts** - Cmd+Enter (Mac) / Ctrl+Enter to translate/generate
- **Change Explanations** - See exactly what was corrected and why

## Requirements

- **macOS** 12.0+ or **Linux** (Ubuntu 20.04+, Fedora 35+, etc.)
- [Ollama](https://ollama.com) installed and running
- Required models:
  - `aya:8b` - Translation
  - `qwen3:4b` - Grammar correction

## Quick Start

1. **Install Ollama**

   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull required models**

   ```bash
   ollama pull aya:8b
   ollama pull qwen3:4b
   ```

3. **Download and run Lingo Leap**
   - **macOS**: Download `.dmg`, drag to Applications
   - **Linux**: Download `.deb` (Debian/Ubuntu), `.rpm` (Fedora), or `.AppImage`
   - Get the latest release from [Releases](https://github.com/knguyen30111/lingo-leap/releases)

## Development

### Prerequisites

- Node.js — the major pinned in `.nvmrc` (run `nvm use`)
- Rust & Cargo (latest stable)

### Install Rust & Cargo

**macOS / Linux:**

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Follow the prompts, then reload your shell
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

**macOS additional requirements:**

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

**Linux additional requirements (Ubuntu/Debian):**

```bash
sudo apt update
sudo apt install -y build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
```

**Linux additional requirements (Fedora):**

```bash
sudo dnf install -y webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel
```

### Setup

```bash
# Install Node.js dependencies from the lockfile
npm ci

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Tech Stack

- **Framework**: Tauri v2
- **Frontend**: React 19 + TypeScript 5.9
- **Build**: Vite 7
- **Styling**: Tailwind CSS 4
- **State**: Zustand 5
- **AI**: Ollama (local LLMs)

## Quality gates

Every pull request and every push to `main` or an `epic/**` branch runs the `CI` workflow
(`.github/workflows/ci.yml`). Both jobs must pass before a pull request into
`epic/refactor-tech-debt` is merged; that expectation is mechanically enforced once the epic's
branch ruleset lists `frontend` and `rust` as required checks. Until then, and on every other
branch, the checks report their result without blocking the merge button.

Required check names do not make their workflow definitions immutable: a pull request that changes
`.github/workflows/**` must receive a trusted owner review of the workflow diff before merge. This
manual trust boundary is required while the repository has a single maintainer and cannot require
an independent GitHub approval without making owner-authored pull requests unmergeable.

| Check      | What it runs                                                                              | Run it locally                                                                         |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `frontend` | locked install, dependency audit, lint, TypeScript, Vite build, unit tests, coverage thresholds | `npm ci && npm audit --audit-level=moderate && npm run lint && npm run build && npm run test:coverage` |
| `rust`     | locked Rust check of the Tauri crate                                                      | `cargo check --locked --manifest-path src-tauri/Cargo.toml`                            |

Node is pinned by `.nvmrc`; run `nvm use` before the commands above so local results match CI.

The audit step covers the whole installed tree, including development and build tooling, because
those packages execute on developer and CI machines. A moderate or higher advisory fails the job.
The fix is a supported dependency upgrade, never a lower `--audit-level`, an `--omit=dev` scope, or
a skipped step.

Lint rules live in `eslint.config.js` and are enforced by `npm run lint`, which fails on any
warning. A lint failure is fixed at its cause, never with an `eslint-disable` comment.

Coverage thresholds live in `vitest.config.ts` and are enforced by `npm run test:coverage`.
Coverage failures are fixed by adding behavior tests, never by lowering thresholds.

Coverage explicitly includes executable `src` TypeScript and TSX files so unimported application and service entry points stay in the denominator.
Excluded surfaces are tests, declarations, the test harness, exact type-only and localization setup files, JSON resources, build output, and dependencies.
A new file therefore moves the reported percentages as soon as it is added, and an entry point
that no test exercises reads as uncovered rather than going silently unmeasured.

macOS packaging is **not** a pull-request check. It runs on demand through the
`package-macos` workflow (manual dispatch, or a `v*` tag) and produces an arm64
`.dmg` and `.app`. Those bundles are ad-hoc signed and not notarized, so Gatekeeper
rejects them; signing is tracked separately. Build one locally with
`CI=true npm run tauri:build` — the `CI=true` prefix is what lets the DMG step run
without a GUI session.

A packaging run counts as passed only when the operator records the run URL and conclusion,
both artifact names and sizes, the arm64-only architecture, the ad-hoc signing status, and the
`rustc`/`node` versions from the run's `Record toolchain` step.

## Configuration

Access settings via the gear icon:

| Setting              | Description                             |
| -------------------- | --------------------------------------- |
| Theme                | Light / Dark / System                   |
| Translation Model    | Ollama model for translation            |
| Correction Model     | Ollama model for grammar                |
| Ollama Host          | API endpoint (default: localhost:11434) |
| Streaming            | Enable/disable streaming responses      |
| Default Target       | Default target language for translation |
| Explanation Language | Language for correction explanations    |
| Speech Recognition   | Language for voice input                |
| Microphone           | Always the system default (change it in OS sound settings) |
| Always On Top        | Keep the window above other windows     |
| Auto Hide After Copy | Hide the window once the output is copied |

## License

MIT
