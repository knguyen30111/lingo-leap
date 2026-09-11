# Lingo Leap

Offline translation and grammar correction app powered by local AI models. Available for **macOS**.

<p align="center">
  <img src="assets/logo.png" alt="Lingo Leap" width="200">
</p>

## Features

- **Translation Mode** - Translate text between languages with auto-detection
- **Correction Mode** - Fix grammar and spelling with three intensity levels:
  - Light: Minor fixes only
  - Medium: Grammar and style improvements
  - Heavy: Full rewrite for clarity
- **Speech-to-Text** - Voice input with continuous recording and silence detection
- **Language Swap** - One-click swap between source and target languages
- **Offline First** - All processing happens locally via Ollama
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

| Check      | What it runs                                                           | Run it locally                                              |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `frontend` | locked install, TypeScript, Vite build, unit tests, coverage thresholds | `npm ci && npm run build && npm run test:coverage`           |
| `rust`     | locked Rust check of the Tauri crate                                    | `cargo check --locked --manifest-path src-tauri/Cargo.toml`  |

Node is pinned by `.nvmrc`; run `nvm use` before the commands above so local results match CI.
Coverage thresholds live in `vitest.config.ts` and are enforced by `npm run test:coverage`.
A coverage failure is fixed by adding a test, never by lowering a threshold.

Coverage is measured only over files the test suite imports, so files such as `src/App.tsx`,
`src/main.tsx`, and `src/services/**` are not represented in the reported percentages.
Two consequences worth knowing before you trust the number: a new file that no test imports
moves these percentages by exactly zero, and the first test written for a currently unmeasured
file pulls that whole file into the denominator and may push the total below the threshold.
When that happens, widening `coverage.include` and re-baselining the thresholds together is the
correct response; it is tracked separately from the per-PR gate.

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
| Microphone           | Select audio input device               |

## License

MIT
