# Open work

Active release work comes first. The older loose ends below were last written
for 2.6; recheck their status before acting on them.

## Release and desktop follow-ups

v2.8 is published from reviewed source commit
`46785cfa2d6d7a68fbb976a5f276b70723e07a9e`. The owner explicitly deferred
the real-phone check until after publication; do not record it as passed.
Milestone [#91](https://github.com/diegoami/balloons-JS/issues/91) contains
the AGREE verdict, owner override, exact artifacts and publication record.
Issue #88 still covers the post-publication phone/page check; the owner is
handling browser/page settings. This session did not change itch visibility.

The release-repository consolidation is tracked in
[#94](https://github.com/diegoami/balloons-JS/issues/94). Eight historical
APKs were independently verified after copying to the public source releases.
The old repository is archived with compatible download pointers, not deleted.
RELEASE-MIGRATION.md and its JSON records preserve provenance and original notes.

The owner then requested a new Windows wrapper (#95); no older desktop binary
existed. DESKTOP.md records its build/smoke process and permanent profile ID.
**Its new native code was not in the reviewed v2.8 tag.** The build tool stages
a traceable preview; stable publication needs a new reviewed candidate, or
the owner can explicitly authorize a clearly labelled preview/exception.
Do not move the existing v2.8 tag or imply its review covered the new wrapper.

ITCH.md contains ready-to-paste page copy, suggested tags, and the cover/
screenshot map. tools/capture_itch_listing.mjs exports from the released ZIP
and intercepts score traffic; the cover adds promotional text and gameplay
scenes are posed with the actual released painters. No game art is replaced.

Two non-blocking review nits remain described on #91: outdated machine-specific
JDK examples and stronger publisher content attestation. They were reproduced
and deliberately deferred so the reviewed release commit remained unchanged.

The earlier paused-test checkpoint is complete: four valid saved runs plus
four continuation runs passed with 24 score / 151 browser / 3 packaging tests,
and the final PR/master eight-job CI sets passed. Preliminary runs 1–2 and
interrupted run 7 were excluded. Do not restart that finished HUD task.

## Loose ends

**Four junk rows on the production leaderboard.** Name "anonymous", score 0,
level 1, posted from the emulator while verifying the app could reach the
board. The board holds ten and sorts by score, so real games push them off
eventually. There is no DELETE on the function by design, so clearing them
early means either emptying the `highscores` blob (key `board`) from the
Netlify UI, or adding a guarded DELETE — a sharper tool than a toy
leaderboard needs.

**A test flake seen once, probably found.** One run reported
`132 passed, 1 failed` just after PR #40 merged, and the failing test was
never identified. CI's first red leg, on #61, was the fading-balloon ceiling
in `the level that announces fading balloons actually has them`: measured on
the 2.2 table, it failed about one suite run in 38, and #61 widened it. That
ceiling was already in the tree when #40 merged, so it is the likely culprit
— likely rather than certain, because the rows were different then. If a
failure turns up in another test, this was not it.

**Release APKs are signed v2 only.** Fine for `minSdk 26`. Adding
`enableV3Signing` would allow rotating the key later; without it the current
keystore is the app's permanent identity.

## Planned: an ammunition mode

A **second mode** for the version after 2.1, explicitly not a change to the
existing one. Not started, and not to be built without a design conversation
first.

The owner played 2.1 on desktop, found it harder than on a tablet, and
suggested ammunition as a way to balance that.

The reading behind it — offered by an assistant, **not yet confirmed by the
owner**, and worth confirming before any design work: the ladder is calibrated
against about 2.3 taps a second from one pointer, and two thumbs on a
touchscreen roughly doubles that. Capping ammunition caps the tap rate, so a
run is decided by aim rather than by how many fingers you brought. That is the
same gap the leaderboard currently apologises for by recording "touch" or
"mouse" beside each score.

Pieces that already exist and should be reused rather than reinvented:
`Ladder` is a table of twenty rows and a new column is the established way to
add a mechanic; `tools/playtest.mjs` can measure a mode at any aim error and
tap rate; the measured supply figure to balance against is 2.29 taps a second
against a demand peaking at 2.72.

Open questions nobody has answered: where ammunition comes from (time? popped
balloons? a reload action?), what running out does, whether the board keeps
one leaderboard or two, and how a player picks a mode when the title screen
starts a game from the Play button.
