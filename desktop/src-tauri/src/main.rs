#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{webview::NewWindowResponse, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Native initialization happens before scores.js reads its URL.
            // The game assets remain exactly the files in public/.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Baloncelli")
                .inner_size(1280.0, 800.0)
                .min_inner_size(640.0, 480.0)
                .resizable(true)
                .initialization_script(
                    "window.BALLOONS_SCORES_URL = 'https://baloncelli.netlify.app/api/scores';",
                )
                .on_navigation(|url| {
                    url.host_str() == Some("tauri.localhost")
                        || url.scheme() == "tauri"
                        || (url.scheme() == "about" && url.path() == "blank")
                })
                .on_new_window(|url, _| {
                    // No shell capability is exposed to the game. Only its
                    // known release download destination opens externally.
                    if url.scheme() == "https"
                        && url.host_str() == Some("github.com")
                        && url.path().starts_with("/diegoami/balloons-JS/releases")
                    {
                        #[cfg(windows)]
                        {
                            use std::os::windows::process::CommandExt;
                            let _ = std::process::Command::new("rundll32.exe")
                                .args(["url.dll,FileProtocolHandler", url.as_str()])
                                .creation_flags(0x08000000)
                                .spawn();
                        }
                    }
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Baloncelli");
}
