# Open work

Small unfinished jobs and one planned feature. None of these block anything;
raise them when there is a lull rather than interrupting a bigger piece of
work. Checked against 2.7 on 2026-09-27.

## Loose ends

**Release APKs are signed v2 only.** Fine for `minSdk 26`. Adding
`enableV3Signing` would allow rotating the key later; without it the current
keystore is the app's permanent identity. Still true of the 2.7 APK:
`apksigner verify --verbose` reports v2 and nothing else.

**The review prompt's second worktree has no path.** `docs/review-prompt.md`
now tells the reviewer where to put the candidate's worktree:
`<main>/../<project>-work/review-{TAG}-<stamp>`, beside the main checkout and
unique per run (#85). But "How to review" still asks for "a second worktree at
{PREV_TAG}" to run old and new side by side, and gives no path for it. A
reviewer standing in a subdirectory can put that one inside the main checkout,
which is what the old candidate path did in #85's side-by-side repro. The fix
is the same rule with `{PREV_TAG}` in place of `{TAG}`. It was left out of #85
because that PR changed only the steps that reach the candidate.

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
