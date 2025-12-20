# Lingo Leap

Offline macOS translation and grammar correction app powered by local AI models.

![Lingo Leap](src-tauri/icons/128x128.png)

## Features

- **Translation Mode** - Translate text between languages with auto-detection
- **Correction Mode** - Fix grammar and spelling with three intensity levels:
  - Light: Minor fixes only
  - Medium: Grammar and style improvements
  - Heavy: Full rewrite for clarity
- **Offline First** - All processing happens locally via Ollama
- **Liquid Glass UI** - Modern design with light/dark/system themes
- **Menu Bar Integration** - Quick access from system tray
- **Streaming Responses** - See results as they generate
- **Smart Caching** - Instant results for repeated queries

## Requirements

- macOS 12.0+
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
   - Download the latest `.dmg` from [Releases](https://github.com/knguyen30111/tran-app/releases)
   - Drag to Applications folder
   - Launch Lingo Leap

## Development

### Prerequisites

- Node.js 18+
- Rust (latest stable)
- Xcode Command Line Tools

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

| Setting | Description |
|---------|-------------|
| Theme | Light / Dark / System |
| Translation Model | Ollama model for translation |
| Correction Model | Ollama model for grammar |
| Ollama Host | API endpoint (default: localhost:11434) |
| Streaming | Enable/disable streaming responses |

## License

MIT
