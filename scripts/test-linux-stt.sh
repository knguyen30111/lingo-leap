#!/bin/bash
# Test STT functionality on Linux
# Run this on a real Ubuntu desktop with microphone
#
# NOTE: WebKitGTK (used by Tauri on Linux) does NOT support Web Speech API.
# We use Whisper.cpp as a local fallback for speech-to-text on Linux.

set -e

echo "=== Lingo Leap Linux STT Test ==="
echo ""
echo "ℹ  Linux uses Whisper.cpp for local speech-to-text (Web Speech API not supported)"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠ Don't run as root - audio permissions may fail"
    exit 1
fi

# Check display
if [ -z "$DISPLAY" ]; then
    echo "❌ No display found. Run on a desktop with GUI."
    exit 1
fi
echo "✅ Display: $DISPLAY"

# Check PulseAudio/PipeWire
if command -v pactl &> /dev/null; then
    if pactl info &> /dev/null; then
        echo "✅ Audio server: $(pactl info | grep 'Server Name' | cut -d: -f2)"
    else
        echo "❌ Audio server not running"
        exit 1
    fi
else
    echo "⚠ pactl not found - cannot verify audio server"
fi

# Check microphone
echo ""
echo "=== Checking Microphone ==="
if command -v arecord &> /dev/null; then
    MICS=$(arecord -l 2>/dev/null | grep "^card" || echo "")
    if [ -n "$MICS" ]; then
        echo "✅ Microphones found:"
        echo "$MICS"
    else
        echo "❌ No microphones found"
        exit 1
    fi
else
    echo "⚠ arecord not found - install alsa-utils to verify mic"
fi

# Test microphone recording
echo ""
echo "=== Quick Mic Test (3 seconds) ==="
echo "Speak into your microphone..."
TEMP_WAV="/tmp/stt-test-$$.wav"
if command -v arecord &> /dev/null; then
    timeout 3 arecord -f cd -t wav "$TEMP_WAV" 2>/dev/null || true
    if [ -f "$TEMP_WAV" ] && [ -s "$TEMP_WAV" ]; then
        SIZE=$(stat --printf="%s" "$TEMP_WAV" 2>/dev/null || stat -f%z "$TEMP_WAV" 2>/dev/null)
        echo "✅ Recorded $SIZE bytes"
        rm -f "$TEMP_WAV"
    else
        echo "⚠ Recording may have failed"
    fi
fi

# Check if app is installed
echo ""
echo "=== Checking App Installation ==="
if [ -f /usr/bin/tran-app ]; then
    echo "✅ App installed: /usr/bin/tran-app"
elif [ -f "./src-tauri/target/release/tran-app" ]; then
    echo "✅ App built: ./src-tauri/target/release/tran-app"
    APP_PATH="./src-tauri/target/release/tran-app"
else
    echo "❌ App not found. Install with:"
    echo "   sudo dpkg -i 'Lingo Leap_0.1.0_arm64.deb'"
    exit 1
fi

# Check WebKit
echo ""
echo "=== Checking WebKit Dependencies ==="
if ldconfig -p | grep -q libwebkit2gtk-4.1; then
    echo "✅ WebKit2GTK 4.1 found"
else
    echo "❌ WebKit2GTK 4.1 not found. Install:"
    echo "   sudo apt install libwebkit2gtk-4.1-0"
    exit 1
fi

# Check Whisper.cpp
echo ""
echo "=== Checking Whisper.cpp (STT Backend) ==="
WHISPER_FOUND=false

if command -v whisper &> /dev/null; then
    echo "✅ whisper found: $(which whisper)"
    WHISPER_FOUND=true
elif command -v whisper-cpp &> /dev/null; then
    echo "✅ whisper-cpp found: $(which whisper-cpp)"
    WHISPER_FOUND=true
elif command -v faster-whisper &> /dev/null; then
    echo "✅ faster-whisper found: $(which faster-whisper)"
    WHISPER_FOUND=true
fi

if [ "$WHISPER_FOUND" = false ]; then
    echo "⚠ Whisper not found. STT will not work."
    echo ""
    echo "To install whisper.cpp:"
    echo "   # Option 1: Build from source"
    echo "   git clone https://github.com/ggerganov/whisper.cpp"
    echo "   cd whisper.cpp && make && sudo cp main /usr/local/bin/whisper"
    echo ""
    echo "   # Option 2: Install faster-whisper (Python)"
    echo "   pip install faster-whisper"
    echo ""
fi

# Check Whisper model
WHISPER_MODEL="$HOME/.cache/whisper/ggml-base.bin"
echo ""
echo "=== Checking Whisper Model ==="
if [ -f "$WHISPER_MODEL" ]; then
    echo "✅ Model found: $WHISPER_MODEL"
else
    echo "⚠ Model not found. Will be auto-downloaded on first STT use."
    echo "   Or download manually:"
    echo "   mkdir -p ~/.cache/whisper"
    echo "   curl -L -o ~/.cache/whisper/ggml-base.bin \\"
    echo "     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
fi

# Launch app
echo ""
echo "=== Launching Lingo Leap ==="
echo "The app will open. Test STT by:"
echo "  1. Click the microphone button"
echo "  2. Speak into your mic (recording will start)"
echo "  3. Click again to stop (audio sent to Whisper)"
echo "  4. Wait for transcription (shows 'Processing...')"
echo "  5. Check if text appears in input field"
echo ""
if [ "$WHISPER_FOUND" = false ]; then
    echo "⚠ Note: STT will fail without Whisper installed"
    echo ""
fi
echo "Press Ctrl+C to exit"
echo ""

if [ -n "$APP_PATH" ]; then
    "$APP_PATH"
else
    /usr/bin/tran-app
fi
