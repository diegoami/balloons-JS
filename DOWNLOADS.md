# Baloncelli — play and download

**[Play on Netlify](https://baloncelli.netlify.app)** ·
**[itch.io](https://diegoami.itch.io/baloncelli)** ·
**[All release assets](https://github.com/diegoami/balloons-JS/releases/latest)**

## Choose a version

| Platform | Download | Status |
|---|---|---|
| Browser | [Play on Netlify](https://baloncelli.netlify.app) or [itch.io](https://diegoami.itch.io/baloncelli) | No installation. |
| Android | [Baloncelli v2.8 APK](https://github.com/diegoami/balloons-JS/releases/download/v2.8/baloncelli-v2.8.apk) | Released; Android 8.0 or newer. |
| Windows x64 | [Portable Windows executable](https://github.com/diegoami/balloons-JS/releases/download/v2.8/Baloncelli-2.8.0-windows-x64-preview.exe) | First desktop preview: `2.8.0-preview-247ff52`. |

Both downloadable apps are also on the [itch.io page](https://diegoami.itch.io/baloncelli).
For other versions, see [release history](https://github.com/diegoami/balloons-JS/releases).
The [v2.8 checksums](https://github.com/diegoami/balloons-JS/releases/download/v2.8/SHA256SUMS.txt)
cover the APK and Windows preview. The Windows source/provenance record is
attached to that same release.

## The game

Pop the balloons before they get away. Twenty levels, twenty seconds each,
five lives to begin with and three more earned on the climb. It can be won.

First written in December 2012 as an experiment with four difficulty settings
and a photograph of a sky, Baloncelli was rebuilt in 2026. Its sky is now drawn
and changes from morning to night, and one twenty-level ladder makes scores
comparable. Reinforced and armoured balloons take extra taps; saucers shoot
back. Leave birds and fireflies alone: touching them costs a life.

Best played on a tablet. Accurate pointing matters, and two thumbs offer a
higher tap rate than one pointer. Scores and controls occupy their own strip
above the playfield, so popping at the top edge does not require tapping pause.

## Installing the Android app

The app needs Android 8.0 or newer and bundles the game for offline play. Its
`INTERNET` permission is used for the shared leaderboard.

1. Download the Android APK from the table above or the [latest release](https://github.com/diegoami/balloons-JS/releases/latest).
2. Open it. Android may ask you to allow installs from the browser or file
   manager used to open the file. Allow that source and install.
3. A normal release update uses the same app identity and signing key and
   installs over the existing release.

An older debug or differently signed build can cause a signature mismatch.
Uninstalling it removes its local player name, run history and personal best;
scores already stored on the shared leaderboard remain there. Do not uninstall
as part of a normal same-key release update.

## Running the Windows app

1. Download the portable Windows x64 executable from the table above and open
   it. There is no installer. The current build was tested on Windows 11.
2. It requires the [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
   The app is unsigned, so Windows may show its standard unknown-publisher prompt.
3. Choose a player name and start with Play or space. Click balloons to pop
   them; pause and quit are in the separate strip above the sky.

The game is bundled for offline play; the shared online leaderboard needs a
connection. Your name, recent completed runs and personal best stay in the
Windows app's local profile, separately from the browser and Android profiles.
Closing the app does not save an unfinished run.

This is the first Windows **preview**, built after the original v2.8 game
release. The owner confirmed it works and the native smoke passed; its new
wrapper was not covered by the original v2.8 independent review. See
[DESKTOP.md](DESKTOP.md) and the release's `windows-preview-source.json` for
source/build details. The Android release and Windows preview share the game
but have separate version labels.

## Source and release history

[Source code, tags and releases](https://github.com/diegoami/balloons-JS) now
live together. The former binary repository is archived for old installed-app
links. [RELEASE-MIGRATION.md](RELEASE-MIGRATION.md) records the byte-verified
historical copies and legacy tag exceptions; no historical APK was rebuilt.

## Credits and licence

Baloncelli is by [Diego Amicabile](https://github.com/diegoami).
[Fredoka](https://fonts.google.com/specimen/Fredoka) is used under the SIL Open
Font License. The original distribution README and release notes are preserved
in [RELEASE-LEGACY.json](RELEASE-LEGACY.json).

The game is distributed directly rather than through the Play Store; it is
free to play. The original project's reason for sideloading was the effort
involved in Play Store distribution.
