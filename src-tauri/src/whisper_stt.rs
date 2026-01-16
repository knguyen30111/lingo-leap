//! Whisper-based Speech-to-Text for Linux
//!
//! WebKitGTK doesn't support Web Speech API, so we use Whisper as a fallback.
//! This module handles audio transcription via whisper.cpp CLI.

use std::io::Write;
use std::process::Command;
use std::path::PathBuf;

/// Check if Whisper CLI is available on the system
#[tauri::command]
pub fn check_whisper_available() -> Result<bool, String> {
    // Check for whisper.cpp CLI (usually installed as 'whisper' or 'whisper-cpp')
    let whisper_commands = ["whisper", "whisper-cpp", "main"];

    for cmd in whisper_commands {
        if Command::new(cmd)
            .arg("--help")
            .output()
            .is_ok()
        {
            return Ok(true);
        }
    }

    // Check for faster-whisper (Python)
    if Command::new("faster-whisper")
        .arg("--help")
        .output()
        .is_ok()
    {
        return Ok(true);
    }

    Ok(false)
}

/// Get the path to Whisper model (downloads if needed)
fn get_whisper_model_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".cache/whisper/ggml-base.bin")
}

/// Transcribe audio data using Whisper
///
/// # Arguments
/// * `audio_data` - Base64 encoded WAV audio data
/// * `language` - Language code (e.g., "en", "vi", "ja")
#[tauri::command]
pub async fn transcribe_audio(audio_data: String, language: String) -> Result<String, String> {
    // Decode base64 audio data
    let audio_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &audio_data
    ).map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Create temp file for audio
    let temp_dir = std::env::temp_dir();
    let audio_path = temp_dir.join(format!("whisper_input_{}.wav", std::process::id()));
    let output_path = temp_dir.join(format!("whisper_output_{}", std::process::id()));

    // Write audio to temp file
    let mut file = std::fs::File::create(&audio_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(&audio_bytes)
        .map_err(|e| format!("Failed to write audio: {}", e))?;
    drop(file);

    // Try different Whisper CLI options
    let result = try_whisper_cli(&audio_path, &output_path, &language).await;

    // Cleanup temp files
    let _ = std::fs::remove_file(&audio_path);
    let _ = std::fs::remove_file(output_path.with_extension("txt"));

    result
}

/// Try to run Whisper CLI with different available commands
async fn try_whisper_cli(
    audio_path: &PathBuf,
    output_path: &PathBuf,
    language: &str
) -> Result<String, String> {
    let model_path = get_whisper_model_path();

    // Try whisper.cpp first (most common on Linux)
    let whisper_commands = [
        ("whisper", vec![
            "-m", model_path.to_str().unwrap_or(""),
            "-f", audio_path.to_str().unwrap_or(""),
            "-l", language,
            "-otxt",
            "-of", output_path.to_str().unwrap_or(""),
        ]),
        ("whisper-cpp", vec![
            "-m", model_path.to_str().unwrap_or(""),
            "-f", audio_path.to_str().unwrap_or(""),
            "-l", language,
            "-otxt",
            "-of", output_path.to_str().unwrap_or(""),
        ]),
    ];

    for (cmd, args) in whisper_commands {
        match Command::new(cmd).args(&args).output() {
            Ok(output) => {
                if output.status.success() {
                    // Read the output text file
                    let txt_path = output_path.with_extension("txt");
                    if let Ok(text) = std::fs::read_to_string(&txt_path) {
                        return Ok(text.trim().to_string());
                    }
                }
                // If command exists but failed, log and try next
                log::warn!("{} failed: {:?}", cmd, String::from_utf8_lossy(&output.stderr));
            }
            Err(_) => continue, // Command not found, try next
        }
    }

    // Try faster-whisper (Python) as fallback
    match Command::new("faster-whisper")
        .args([
            audio_path.to_str().unwrap_or(""),
            "--language", language,
            "--model", "base",
            "--output_format", "txt",
        ])
        .output()
    {
        Ok(output) if output.status.success() => {
            return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
        }
        _ => {}
    }

    Err("Whisper not available. Install whisper.cpp: https://github.com/ggerganov/whisper.cpp".to_string())
}

/// Download Whisper model if not present
#[tauri::command]
pub async fn ensure_whisper_model() -> Result<String, String> {
    let model_path = get_whisper_model_path();

    if model_path.exists() {
        return Ok("Model already downloaded".to_string());
    }

    // Create cache directory
    if let Some(parent) = model_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }

    // Download model using curl or wget
    let model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

    let download_result = Command::new("curl")
        .args(["-L", "-o", model_path.to_str().unwrap_or(""), model_url])
        .output();

    match download_result {
        Ok(output) if output.status.success() => {
            Ok("Model downloaded successfully".to_string())
        }
        _ => {
            // Try wget as fallback
            let wget_result = Command::new("wget")
                .args(["-O", model_path.to_str().unwrap_or(""), model_url])
                .output();

            match wget_result {
                Ok(output) if output.status.success() => {
                    Ok("Model downloaded successfully".to_string())
                }
                _ => Err("Failed to download model. Install curl or wget.".to_string())
            }
        }
    }
}
