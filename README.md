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

- Node.js 18+
- Rust (latest stable)
- **macOS**: Xcode Command Line Tools
- **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Tech Stack

- **Framework**: Tauri v2
- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
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
