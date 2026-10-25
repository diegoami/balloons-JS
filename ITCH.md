# Baloncelli on itch.io

The browser and Android builds are published as v2.8. A Windows wrapper was
requested afterward and is separate new platform work; do not label it as
independently reviewed with the original v2.8 candidate. Read version numbers
from Gradle and git tags. This file contains the copy and assets for the page,
followed by the packaging workflow.

## Upload kit

The cover and five screenshots are in [itch-listing/v2.8](itch-listing/v2.8/README.md).
The local upload bundle is `dist-itch/Baloncelli-2.8-itch-listing.zip`; it contains
this file and the images with the same relative paths.

| itch.io field | File | Notes |
|---|---|---|
| Cover | [cover-630x500.png](itch-listing/v2.8/cover-630x500.png) | Promotional title over artwork from the released game. |
| Screenshot 1 | [01-title-1280x720.png](itch-listing/v2.8/01-title-1280x720.png) | Opening screen. |
| Screenshot 2 | [02-morning-1280x720.png](itch-listing/v2.8/02-morning-1280x720.png) | Balloons and separate HUD strip. |
| Screenshot 3 | [03-saucer-1280x720.png](itch-listing/v2.8/03-saucer-1280x720.png) | Saucer and reinforced balloons. |
| Screenshot 4 | [04-night-1280x720.png](itch-listing/v2.8/04-night-1280x720.png) | Night sky, mark II saucer, birds and fireflies. |
| Screenshot 5 | [05-phone-960x1440.png](itch-listing/v2.8/05-phone-960x1440.png) | 480×720 portrait viewport, captured at 2× density. |

These are staged scenes rendered by the actual v2.8 code/painters, with no
gameplay art replaced. The cover adds promotional text. Source commit and
image checksums are in [source.json](itch-listing/v2.8/source.json). Reproduce
after staging the tagged release ZIP with `node tools/capture_itch_listing.mjs v2.8`.

## Page setup

The owner confirmed **diegoami/baloncelli**:
<https://diegoami.itch.io/baloncelli>. Set the project kind to HTML.
Butler uploads builds; it cannot create or edit the page.

Check the actual browser build with `butler status diegoami/baloncelli:html5`
(`:android` for the APK). Include the channel: this Butler installation can
report “No channel” for the bare project even when its HTML5 build exists.

- Free; released; genre Action / Arcade. Language: English. Single-player.
  Disclose AI-assisted code as on the other games.
- Suggested tags to paste: **arcade, casual, singleplayer, 2d, score-attack,
  high-score, touch-friendly, balloons**. `offline` also describes the bundled
  Android app; the browser version first needs to load its files.
- Set the HTML5 upload to **This file will be played in the browser**.
- Embed **480×720**, portrait. Enable the player's fullscreen option. The game
  must never force fullscreen or an orientation lock (issue #88).
- Keep the Android channel a downloadable APK, marked Android.
- Smallest validated windows: **320×480 portrait** and **320×240 landscape**.
  The 480×720 canonical embed and 640×480 alternate both pass. At 240×320 the
  first instruction is clipped, so that width is below the supported baseline.
  These are tested windows, not a claim about every possible minimum size.
- Use screenshots of the packaged build, saved by the ZIP smoke under its
  `screenshots/` directory. Capture/choose a cover from real gameplay.
- Title: **Baloncelli**.
- Short description: **Pop balloons through twenty levels as the sky turns
  from morning to night. Play in your browser, on Android, or try the Windows preview.**

Long description:

> Click or tap balloons before they escape. Climb twenty levels as morning
> turns to afternoon, dusk and night. Reinforced balloons take two hits;
> armoured balloons take three. Watch out for birds, fireflies and saucers.
>
> Five lives to start, with three more earned on the climb. A complete run
> lasts 6 minutes 40 seconds. Start with the Play button or space. Best played
> on a tablet.
>
> No account or ads. Choose a player name and compare runs on the shared online
> leaderboard. Your recent runs and personal best stay in this browser or app.
> The Android app bundles the game so it can also be played offline.
>
> Windows preview: download the portable x64 executable and open it. It needs
> the Microsoft Edge WebView2 runtime and is unsigned, so Windows may show its
> standard unknown-publisher prompt. Your name and completed-run history stay
> in the app's local profile.
>
> Controls: click or tap balloons. Use Play or space to start; pause and quit
> are in their own strip above the sky.
>
> Source: https://github.com/diegoami/balloons-JS
> Downloads and installation: https://github.com/diegoami/balloons-JS/blob/master/DOWNLOADS.md

**Current Windows upload:** `2.8.0-preview-247ff52`, also attached to the v2.8
GitHub release. The screenshots show the released browser game and do not
claim an independent review of the new native wrapper. No Windows binary
existed in the old release history.

See [DESKTOP.md](DESKTOP.md) for native build/source provenance. Do not label
the new native code as independently reviewed with the earlier v2.8 game tag.

## Package and verify

Commit all changes first. Commands default to a dry run; `--confirm` writes
artifacts or uploads. Run from the repository root. Node and git are required;
Android additionally needs the Java 21/SDK/signing setup in android/README.md.
Never read or copy signing secrets.

```powershell
node tools/package_itch.mjs --candidate --confirm
node tools/package_android.mjs --candidate --confirm
node tools/smoke_itch_zip.mjs dist-itch/candidate-<full-SHA>
```

The browser ZIP contains only tracked `public/` files from that commit, with
one packaging-only addition to index.html: set `window.BALLOONS_SCORES_URL`
before scripts load, pointing at `https://baloncelli.netlify.app/api/scores`.
Netlify's API already permits cross-origin GET/POST/OPTIONS. The normal Netlify
site and Android's existing URL injection are unchanged. Personal history is
local to each platform's origin; the global board is shared.

Each stage has source commit/tree/version and SHA-256 records. Android's
record is in the stage's `android/` subdirectory. The ZIP smoke verifies its
hash, extracts using the OS tool, compares every file to the source commit,
then tests the extracted game in a cross-origin iframe. Score requests are
intercepted: smoke runs never write test scores to production. It saves title
and playing screenshots for visual inspection.

Before tagging: inspect the screenshots, play the candidate, and upload its
HTML5 ZIP to a private itch.io draft for a **real phone check**, as issue #88
requires. Check orientation, name entry, Play, popping, pause/resume, and the
leaderboard. During play, the top information/control strip is outside the
balloon field: check that a balloon tapped just below it cannot activate pause
or quit. The controls retain 44px tap targets inside the strip while looking
smaller. Verify APK signing with the SDK's `apksigner verify --verbose`.
Record the phone result and APK hash on the milestone issue. Complete the
independent review and owner's merge steps in AGENTS.md before tagging.

After AGREE, on a clean checkout of the exact annotated release tag:

```powershell
node tools/package_itch.mjs --confirm
node tools/package_android.mjs --confirm
node tools/smoke_itch_zip.mjs dist-itch/v2.8
node tools/publish_itch.mjs --project diegoami/baloncelli
node tools/publish_itch.mjs --project diegoami/baloncelli --confirm
```

The uploader checks both source records, checksums, release ZIP smoke result,
annotated tag on the live origin, and ancestry on origin/master. It uploads
exactly one file each to `html5` and `android`, with the same version. Set
`BUTLER` to butler's executable if it is not on PATH; butler manages its own
stored login. No credentials are read or printed by these tools. GitHub releases
also live in `diegoami/balloons-JS`; the owner publishes the APK or explicitly
asks the implementer to do it. The former release repository is archived with
its old assets retained (RELEASE-MIGRATION.md).
