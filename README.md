# Lingo Leap

Offline translation and grammar correction app powered by local AI models. Available for **macOS**.

<p align="center">
  <img src="assets/logo.png" alt="Lingo Leap" width="200">
</p>

## Features

- **Translation Mode** - Translate text between languages with auto-detection
- **Correction Mode** - Improve text at three levels of intervention:
  - Fix: spelling and grammar only, wording untouched
  - Improve: tightens clarity while keeping the author's wording where it works
  - Rewrite: restructures freely, still in plain language and the original register
- **Instant or Thinking** - Choose per run whether a correction answers
  immediately or reasons first, with the model's reasoning available in a
  collapsible panel. Thinking applies to the Improve and Rewrite levels and runs
  on its own model, which must advertise Ollama's `thinking` capability. The Fix
  pass is mechanical and always runs instantly.
- **Response Times** - Every translation and correction counts up while it runs
  and reports how long it took, so a slow reasoning pass never looks like a hang
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
  - `qwen2.5:7b` - Correction
- Optional model:
  - `qwen3:4b` - Reasoning, only needed for the Thinking mode. Any model that
    advertises Ollama's `thinking` capability works; pick it under
    Settings > Reasoning model.

## Quick Start

1. **Install Ollama**

   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull required models**

   ```bash
   ollama pull aya:8b
   ollama pull qwen2.5:7b

   # optional, enables Thinking mode for Improve and Rewrite
   ollama pull qwen3:4b
   ```

3. **Download and run Lingo Leap**
   - **macOS**: Download `.dmg`, drag to Applications
   - **Linux**: Download `.deb` (Debian/Ubuntu), `.rpm` (Fedora), or `.AppImage`
   - Get the latest release from [Releases](https://github.com/knguyen30111/lingo-leap/releases)

## Development

### Prerequisites

- Node.js 18+
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
# Install Node.js dependencies
npm install

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
