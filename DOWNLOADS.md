# Baloncelli — play and download

**[Play on Netlify](https://baloncelli.netlify.app)** ·
**[itch.io](https://diegoami.itch.io/baloncelli)** ·
**[Latest Android release](https://github.com/diegoami/balloons-JS/releases/latest)**

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

1. Download the APK attached to the [latest release](https://github.com/diegoami/balloons-JS/releases/latest).
2. Open it. Android may ask you to allow installs from the browser or file
   manager used to open the file. Allow that source and install.
3. A normal release update uses the same app identity and signing key and
   installs over the existing release.

An older debug or differently signed build can cause a signature mismatch.
Uninstalling it removes its local player name, run history and personal best;
scores already stored on the shared leaderboard remain there. Do not uninstall
as part of a normal same-key release update.

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
