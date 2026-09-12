# Lingo Leap

Local-AI translation and grammar correction app powered by Ollama. Distributed for **macOS on Apple silicon (arm64)**.

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
- **Local AI** - Translation and grammar correction run against the configured Ollama endpoint,
  which is `http://localhost:11434` by default and therefore stays on your machine. The endpoint
  is configurable, so a remote host you set receives the text being translated — see
  [docs/privacy.md](docs/privacy.md)
- **Liquid Glass UI** - Modern design with light/dark/system themes
- **Refined Settings** - Organized settings panel with grouped sections
- **Menu Bar Integration** - Quick access from system tray
- **Streaming Responses** - See results as they generate
- **Smart Caching** - Instant results for repeated queries
- **Keyboard Shortcuts** - Cmd+Enter (Mac) / Ctrl+Enter to translate/generate
- **Change Explanations** - See exactly what was corrected and why

## Requirements

- **macOS** 14.0+ on Apple silicon (arm64). The floor follows the required Ollama's own macOS 14+
  minimum
- [Ollama](https://ollama.com) installed and running
- Required models:
  - `aya:8b` - Translation
  - `qwen2.5:7b` - Grammar correction

## Quick Start

1. **Install Ollama**

   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull required models**

   ```bash
   ollama pull aya:8b
   ollama pull qwen2.5:7b
   ```

3. **Download and run Lingo Leap**
   - **macOS (arm64)**: download the `.dmg` and drag the app to Applications
   - Get the latest release from [Releases](https://github.com/knguyen30111/lingo-leap/releases)
   - Published bundles are ad-hoc signed, so Gatekeeper does not accept them on first launch;
     open the app from its context menu the first time. A Developer ID signed build is a future
     decision, not something that exists today — see [docs/release.md](docs/release.md)

## Platform support

| Platform | Status |
| -------- | ------ |
| macOS 14.0+, arm64 | the only supported distributed binary |
| Linux | best-effort **source development** only, via the Docker workflow below. No release artifact is built or published |
| Windows | unsupported |

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
| `frontend` | locked install, dependency audit, lint, workflow lint, typecheck, release contract, Vite build, unit tests, coverage thresholds | `npm ci && npm audit --audit-level=moderate && npm run lint && npm run lint:workflows && npm run typecheck && npm run verify:release-contract && npm run build && npm run test:coverage` |
| `rust`     | locked Rust check of the Tauri crate                                                      | `cargo check --locked --manifest-path src-tauri/Cargo.toml`                            |

Three of those gates are individually invocable, and each fails the build on its own:

| Gate                             | What it asserts                                                                 | Run it locally                     |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| `npm run typecheck`              | `tsc --noEmit`, so a type error is reported as a type error rather than as a build failure | `npm run typecheck`                |
| `npm run lint:workflows`         | `actionlint`, fetched from a release pinned by version and SHA-256 in `scripts/actionlint.sha256` and verified before it is extracted or executed | `npm run lint:workflows`           |
| `npm run verify:release-contract` | the machine-checkable release rules under `scripts/release-contract/`           | `npm run verify:release-contract`  |

`build` is the Vite production build only. Type checking is `typecheck`, so the two cannot silently
re-merge and hide a type error behind a bundler change; the release contract asserts that separation.

The `actionlint` digest committed in `scripts/actionlint.sha256` is the authority and is never
regenerated from a download. A checksum mismatch is a supply-chain finding: the archive is not
extracted and the binary is not executed.

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

macOS packaging is **not** a pull-request check. It runs **only** on manual dispatch through the
`package-macos` workflow and produces an arm64 `.dmg` and `.app`. It is **verification-only**: the
bundles are ad-hoc signed with the Hardened Runtime in force, are not notarized, and are not for
distribution. Build one locally with `CI=true npm run tauri:build` — the `CI=true` prefix is what
lets the DMG step run without a GUI session.

The workflow has **never run**, and it cannot be dispatched until its definition reaches the
default branch. What is proven today is the assertion set, not the runner: the package verifier
under `scripts/` is the same script the workflow invokes, and it runs locally against a real bundle
to assert the architecture, signature mode, entitlements, DMG integrity, checksums, artifact names
and sizes, and a controlled launch and termination. See [docs/release.md](docs/release.md).

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

MIT — see [LICENSE](LICENSE).

## Project documents

| Document | What it covers |
| -------- | -------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | branch model, local gates, commit conventions |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | community standards and how to raise a concern |
| [SECURITY.md](SECURITY.md) | how to report a vulnerability, and what is in scope |
| [docs/system-architecture.md](docs/system-architecture.md) | processes, permission surface, CSP, data flow, signing posture |
| [docs/privacy.md](docs/privacy.md) | what leaves your machine and what does not |
| [docs/release.md](docs/release.md) | version authorities, packaging status, rollback |
