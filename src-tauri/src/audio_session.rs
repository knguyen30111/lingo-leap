//! macOS AVAudioSession management for proper audio routing
//!
//! When microphone is activated, macOS switches to a "voice chat" audio profile
//! that degrades system-wide audio quality. This module provides commands to
//! properly activate/deactivate the audio session so quality is restored.

#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl, runtime::Object};

#[cfg(target_os = "macos")]
use objc_foundation::INSString;

/// AVAudioSession category constants
#[cfg(target_os = "macos")]
mod constants {
    // AVAudioSessionCategoryPlayAndRecord - for simultaneous input/output
    pub const CATEGORY_PLAY_AND_RECORD: &str = "AVAudioSessionCategoryPlayAndRecord";

    // AVAudioSessionCategoryOptionDefaultToSpeaker = 1 << 1
    pub const OPTION_DEFAULT_TO_SPEAKER: u64 = 0x2;

    // AVAudioSessionCategoryOptionAllowBluetooth = 1 << 2
    pub const OPTION_ALLOW_BLUETOOTH: u64 = 0x4;

    // AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation = 1
    pub const DEACTIVATE_NOTIFY_OTHERS: u64 = 0x1;
}

/// Activate audio session for voice recording
/// Sets category to PlayAndRecord with speaker output
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn activate_voice_session() -> Result<(), String> {
    unsafe {
        // Get shared AVAudioSession instance
        let av_audio_session_class = class!(AVAudioSession);
        let session: *mut Object = msg_send![av_audio_session_class, sharedInstance];

        if session.is_null() {
            return Err("Failed to get AVAudioSession instance".into());
        }

        // Create category string
        let category_str = objc_foundation::NSString::from_str(constants::CATEGORY_PLAY_AND_RECORD);

        // Set category with options: defaultToSpeaker | allowBluetooth
        let options = constants::OPTION_DEFAULT_TO_SPEAKER | constants::OPTION_ALLOW_BLUETOOTH;

        let mut error: *mut Object = std::ptr::null_mut();
        let success: bool = msg_send![
            session,
            setCategory: category_str
            withOptions: options
            error: &mut error as *mut *mut Object
        ];

        if !success || !error.is_null() {
            return Err("Failed to set audio session category".into());
        }

        // Activate the session
        let mut error: *mut Object = std::ptr::null_mut();
        let success: bool = msg_send![
            session,
            setActive: true
            error: &mut error as *mut *mut Object
        ];

        if !success || !error.is_null() {
            return Err("Failed to activate audio session".into());
        }

        log::info!("Audio session activated for voice recording");
        Ok(())
    }
}

/// Deactivate audio session and notify other apps to restore their audio
/// This is the key to restoring audio quality when mic is turned off
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn deactivate_voice_session() -> Result<(), String> {
    unsafe {
        // Get shared AVAudioSession instance
        let av_audio_session_class = class!(AVAudioSession);
        let session: *mut Object = msg_send![av_audio_session_class, sharedInstance];

        if session.is_null() {
            return Err("Failed to get AVAudioSession instance".into());
        }

        // Deactivate with NotifyOthersOnDeactivation option
        // This tells the system to restore previous audio routes for other apps
        let mut error: *mut Object = std::ptr::null_mut();
        let success: bool = msg_send![
            session,
            setActive: false
            withOptions: constants::DEACTIVATE_NOTIFY_OTHERS
            error: &mut error as *mut *mut Object
        ];

        if !success || !error.is_null() {
            // Deactivation can fail if audio is still playing, but that's usually OK
            log::warn!("Audio session deactivation returned error (may be benign)");
        }

        log::info!("Audio session deactivated, other apps notified to restore audio");
        Ok(())
    }
}

// Stub implementations for non-macOS platforms
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn activate_voice_session() -> Result<(), String> {
    log::info!("Audio session management not available on this platform");
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn deactivate_voice_session() -> Result<(), String> {
    log::info!("Audio session management not available on this platform");
    Ok(())
}
