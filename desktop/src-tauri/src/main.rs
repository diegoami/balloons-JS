#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{webview::NewWindowResponse, WebviewUrl, WebviewWindowBuilder};

fn allowed_download_url(url: &tauri::Url) -> bool {
    let release_path = "/diegoami/balloons-JS/releases";
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && (url.path() == "/diegoami/balloons-JS/blob/master/DOWNLOADS.md"
            || url.path() == release_path
            || url.path().starts_with(&format!("{release_path}/")))
}

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
                    // known downloads directory/release destinations open externally.
                    if allowed_download_url(&url) {
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

#[cfg(test)]
mod tests {
    use super::allowed_download_url;
    use tauri::Url;

    #[test]
    fn opens_the_directory_and_release_downloads() {
        for url in [
            "https://github.com/diegoami/balloons-JS/blob/master/DOWNLOADS.md",
            "https://github.com/diegoami/balloons-JS/releases/latest",
            "https://github.com/diegoami/balloons-JS/releases/download/v2.8/baloncelli-v2.8.apk",
        ] {
            assert!(allowed_download_url(&Url::parse(url).unwrap()));
        }
    }

    #[test]
    fn rejects_other_hosts_schemes_and_unrelated_paths() {
        for url in [
            "http://github.com/diegoami/balloons-JS/blob/master/DOWNLOADS.md",
            "https://github.com.example/diegoami/balloons-JS/releases/latest",
            "https://github.com/diegoami/balloons-JS/releases-unrelated",
            "https://github.com/diegoami/balloons-JS/blob/master/README.md",
            "file:///C:/Windows/System32/cmd.exe",
        ] {
            assert!(!allowed_download_url(&Url::parse(url).unwrap()));
        }
    }
}
