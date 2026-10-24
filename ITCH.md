# Baloncelli on itch.io

Browser and Android, both built from the same release commit. The next release
is prepared as v2.8; read subsequent version numbers from Android's Gradle file
and git tags. This supplements the milestone process in AGENTS.md.

## Page setup

Create an HTML game under the owner's diegoami account, using `baloncelli` if
available. The project does not exist yet; confirm its actual owner/slug before
running the uploader. Butler uploads builds; it cannot create or edit the page.

- Free; released; genre Action. Suggested tags: arcade, balloons, singleplayer,
  browser, touch-friendly. Disclose AI-assisted code as on the other games.
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
  from morning to night. Play in your browser or on Android.**

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
> Source: https://github.com/diegoami/balloons-JS
> Android releases: https://github.com/diegoami/balloons-js-releases/releases

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
leaderboard. Verify APK signing with the SDK's `apksigner verify --verbose`.
Record the phone result and APK hash on the milestone issue. Complete the
independent review and owner's merge steps in AGENTS.md before tagging.

After AGREE, on a clean checkout of the exact annotated release tag:

```powershell
node tools/package_itch.mjs --confirm
node tools/package_android.mjs --confirm
node tools/smoke_itch_zip.mjs dist-itch/v2.8
node tools/publish_itch.mjs --project diegoami/<confirmed-slug>
node tools/publish_itch.mjs --project diegoami/<confirmed-slug> --confirm
```

The uploader checks both source records, checksums, release ZIP smoke result,
annotated tag on the live origin, and ancestry on origin/master. It uploads
exactly one file each to `html5` and `android`, with the same version. Set
`BUTLER` to butler's executable if it is not on PATH; butler manages its own
stored login. No credentials are read or printed by these tools. Publishing
the APK to the GitHub releases repository remains the owner's step.
