# Lingo Leap

Local-AI translation and grammar correction app powered by Ollama. Built and verified for **macOS on
Apple silicon (arm64)**. There is no distributable download.

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

3. **Build Lingo Leap from source**

   There is no distributable download. Build the app yourself by following
   [Development](#development) below.

   The assets on the [Releases](https://github.com/knguyen30111/lingo-leap/releases) page are
   **historical and unverified**: they predate the checks described here, and none of them was
   produced by the current packaging path. They are ad-hoc signed; they are **not** notarized and
   carry **no** Developer ID identity. They are **not distributable** and are kept only as a record
   of what was once published — [docs/release.md](docs/release.md) records exactly which of the
   current path's assertions that asset fails, and which two it satisfies.
   A signed and notarized build is a future decision, not something that exists today

## Platform support

| Platform | Status |
| -------- | ------ |
| macOS 14.0+, arm64 | the only target the app is built and verified for. Bundles are ad-hoc signed and verification-only; no distributable binary is published |
| Linux | best-effort **source development** only, in the container built from [`Dockerfile.linux`](Dockerfile.linux). No release artifact is built or published, and no workflow builds one |
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

**Linux without installing any of that:** [`Dockerfile.linux`](Dockerfile.linux) builds an Ubuntu
22.04 image carrying the Tauri system libraries, the Node major `.nvmrc` pins, and Rust stable, and
[`docker-compose.linux.yml`](docker-compose.linux.yml) mounts the repository into it with caches for
`node_modules`, the Cargo registry, and the build target:

```bash
docker compose -f docker-compose.linux.yml run --rm linux-dev
# inside the container
npm ci
node scripts/run-gates.mjs frontend
node scripts/run-gates.mjs rust
```

The container is for **source development and gate runs only**. It produces no release artifact,
and no workflow builds or publishes a Linux bundle.

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

### Running the gates

`node scripts/run-gates.mjs <group>` is how every surface runs a gate group: CI, the packaging
workflow, and a local run all invoke exactly that script, so none of them can quietly fall behind
another.

What a gate *is* lives in two files that have to agree, and changing a gate means changing both on
purpose:

| File | Role |
| ---- | ---- |
| `scripts/release-contract/lib/gate-contract.mjs` | the canonical declaration of which gates are required, in which order |
| `scripts/gates.json` | the manifest the runner executes |

The release contract asserts that each manifest group equals its declared list element for element,
so a missing gate, an extra gate, a repeated gate, and a reordered gate each fail a gate instead of
passing quietly.

| Check      | Run it locally                          |
| ---------- | --------------------------------------- |
| `frontend` | `node scripts/run-gates.mjs frontend`   |
| `rust`     | `node scripts/run-gates.mjs rust`       |

The `frontend` group is a locked install, a dependency audit, lint, workflow lint, typecheck, the
release contract, the Vite build, unit tests, and coverage thresholds; the `rust` group is a locked
`cargo check` of the Tauri crate. Those commands are written down in the two files above — the list
below describes what each one asserts and is not a second copy to run by hand:

| Gate                              | What it asserts                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `npm ci`                          | the dependency tree installs from the lockfile, with no resolution drift        |
| `npm audit --audit-level=moderate` | no moderate-or-higher advisory in the whole installed tree                     |
| `npm run lint`                    | `eslint` over `src` and `scripts`, failing on any warning                       |
| `npm run lint:workflows`          | `actionlint`, fetched from a release pinned by version and SHA-256 in `scripts/actionlint.sha256` and verified before it is extracted or executed |
| `npm run typecheck`               | `tsc --noEmit`, so a type error is reported as a type error rather than as a build failure |
| `npm run verify:release-contract` | the machine-checkable release rules under `scripts/release-contract/`           |
| `npm run build`                   | the Vite production build, and nothing else                                     |
| `npm run test:coverage`           | unit tests plus the coverage thresholds in `vitest.config.ts`                    |
| `cargo check --locked --manifest-path src-tauri/Cargo.toml` | the Tauri crate builds against the committed `Cargo.lock` |

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
default branch — a `workflow_dispatch` workflow is only dispatchable from the default branch, so no
packaging pass is being claimed here.

What is proven today is the assertion set, not the runner. `npm run verify:package -- <bundle-root>`
is the same command the workflow invokes, and it runs locally against a real bundle. It asserts:

- exactly one `.app` and exactly one `.dmg` under the bundle root, so no stale artifact makes a
  checksum ambiguous;
- the executable exists at `Contents/MacOS/tran-app` — the crate name, not the product name — and is
  executable;
- `lipo -archs` reports exactly `arm64`, with no second slice;
- `codesign --verify --deep --strict` passes;
- `codesign -dv` reports `Signature=adhoc` **and** a `runtime` flag, so the Hardened Runtime is in
  force;
- the shipped entitlements are exactly `com.apple.security.device.audio-input`, and that key is set
  to boolean `true` rather than merely listed;
- the bundled `Info.plist` identifier, versions, and minimum system version equal the values in
  `src-tauri/tauri.conf.json`, and both usage-description strings equal the values in
  `src-tauri/Info.plist` — every expected value is read from those files rather than hardcoded;
- the configured CSP string is present in the executable;
- `hdiutil verify` passes on the DMG and its filename carries the agreed version;
- the `.app` payload is at least **4 MiB** and the DMG at least **2 MiB**, so an empty or truncated
  artifact is reported rather than signed off. Both figures are floors derived from measured real
  builds; no upper bound is asserted, because a ceiling would be a distribution-size policy this
  project does not have.

Three things are **separate workflow steps, not verifier assertions**, and the verifier would pass
without them: the SHA-256 checksums of the DMG and the archived `.app`, the `.app` tarball itself,
and the run summary. Neither the workflow nor the verifier starts the app: no step launches or
terminates it. A controlled launch and termination was performed by hand against a locally built
bundle and its output recorded locally at the time; it is local evidence from one machine, not an
automated gate, and it is not carried in this repository.

See [docs/release.md](docs/release.md).

## Configuration

Access settings via the gear icon:

| Setting              | Description                             |
| -------------------- | --------------------------------------- |
| Theme                | Light / Dark / System                   |
| Translation Model    | Ollama model for translation            |
| Correction Model     | Ollama model for grammar                |
| Ollama Host          | API endpoint (default: localhost:11434). Also editable from the setup screen, so an unreachable saved host can be corrected or reset there |
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
