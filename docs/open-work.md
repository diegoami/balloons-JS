# Open work

Small unfinished jobs and one planned feature. None of these block anything;
raise them when there is a lull rather than interrupting a bigger piece of
work. Current as of 2.4.

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
