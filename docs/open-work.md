# Open work

Active release work comes first. The older loose ends below were last written
for 2.6; recheck their status before acting on them.

## Active: finish the v2.8 HUD revision

The owner resumed this work after the 2026-10-25 pause. Current implementation
and release decisions are in [#92](https://github.com/diegoami/balloons-JS/issues/92)
and milestone [#91](https://github.com/diegoami/balloons-JS/issues/91); check their
latest comments and the implementation PR's CI before acting.

The release is still untagged. PR #90 merged as
`15bfbad5e55914ebb5f047e41b2a38bcd4789227` on master, and milestone
[#91](https://github.com/diegoami/balloons-JS/issues/91) records that candidate.
The owner's phone playtest then requested a separate HUD/playfield and smaller
controls: design [#92](https://github.com/diegoami/balloons-JS/issues/92), also
addressing the clock overlap in #89. A hold comment on #91 says not to tag the
old candidate while this revision is pending. Read the issue/comments again
before preparing a review; an approval of the old SHA cannot approve this fix.

Implementation is committed on local branch `fix/separate-playfield-hud`.
The code/test checkpoint is `8d8addc66eb91e6a327ddfde916c1ca1dabed356`;
subsequent resume/checkpoint edits only change documentation. README and #92
explain the change; the ladder is unchanged. The browser
suite now registers **151** tests (previous HUD test replaced by four checks),
and CI's `EXPECT_BROWSER` is updated in the implementation commit.

Validation needs finishing before any push:

- Six complete serial runs are in ignored local logs
  `dist-itch/playfield-final-1.log` through `playfield-final-6.log`. Each was
  verified to contain exactly **24 score**, **151 browser / 0 failed**, and
  **3 packaging** passes. Run 7 is interrupted and must not count.
- Only **runs 3–6** began after the final strengthened pixel checks and phone
  documentation were committed. Runs 1–2 are preliminary: the helper was
  strengthened to require actual visible score/level/clock/life ink, so a
  blank HUD cannot pass merely by avoiding overlap. Continuation runs use
  `dist-itch/playfield-resume-*.log`. Before pushing, verify a combined total
  of eight full final passes with the exact counts above; do not count the
  interrupted run. Documentation-only resume edits are covered by the
  continuation runs. If gameplay/test code changes, restart the eight-pass
  count after the final edit.
- The actual registered regression checks were run against the old candidate
  and the new code. Old: **0 passed, 4 failed**, exercising actual balloon
  pixels in the strip, a strip tap costing a life and the old escape location.
  New plus related fading/lifetime/rotation checks: **7 passed, 0 failed**.
  Scratch runner/logs: `dist-itch/run-playfield-regression.mjs`,
  `playfield-old-final.log`, `playfield-related-final.log` (all ignored).
- The packaged ZIP smoke passed on the implementation; the final checkpoint
  ZIP has identical bytes. Android builds and its v2 signature verifies.
  Staged ZIP/APK and source/checksum records for `8d8addc...` are under
  `dist-itch/candidate-8d8addc66eb91e6a327ddfde916c1ca1dabed356/` (APK in
  `android/`). Repackage from the eventual final PR/merge commit rather than
  presenting these old source records as a later commit's build.
- Phone/desktop previews are in `dist-itch/playfield-preview/`; the capture
  script and draft PR body are also under ignored `dist-itch/`. **The draft
  `playfield-pr-body.md` already contains planned eight-pass wording: do not
  publish that claim until the remaining runs actually pass.**

The owner confirmed <https://diegoami.itch.io/baloncelli> is a **private draft**.
Its first processed `html5` build was the **old** candidate, version
`2.8-candidate-15bfbad`, build `2204028`. Check the actual channel for the
current version (ITCH.md), rather than assuming this first build is current.
After validation, open the implementation PR (intentionally addressing #92
and #89) and arrange a new private phone preview. The owner merges on green
CI; the earlier permission to merge #90 is not blanket permission for new PRs.
After merge, rebuild on the new candidate, update #91's SHA/artifacts/CI and
provide the fresh independent-review prompt. The owner said they will choose
and launch the reviewer themselves; this session launched no external review.
Monitor actual review outcomes per #87 when one is launched. The real-phone
check and independent review must complete before tagging; GitHub APK
publication stays with the owner. See ITCH.md and AGENTS.md for the process.

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
