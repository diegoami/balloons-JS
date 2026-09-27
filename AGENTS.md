# Baloncelli

The game is plain static files with no build step. `README.md` has the module
map and how to run things, `android/README.md` covers the app, and
`docs/open-work.md` lists what is still open. This file is about what to read,
what to leave alone, what has already been decided, and how to know a change
works.

Everything worth carrying between sessions lives in this repository. If you
learn something durable — a trap, a decision, a reason — write it here or in
one of those files, not into a note only you can see.

This is the one instructions file, for every tool. `CLAUDE.md` only imports it.

## Roles

- **Implementer.** Writes the design, the code and the tests; replies on GitHub
  signed `— Implementer (<model>)`.
- **Reviewer.** A model that implemented none of the release, chosen by the
  owner, in a fresh session. It verifies against the real code rather than
  trusting the description, opens one issue per finding it reproduced, and
  posts its verdict on the milestone issue. In OpenCode it runs as the
  `release-reviewer` agent, started by the owner.
- Reviewers post through the owner's GitHub account — there is no separate bot
  identity — so the signature line is the only marker of authorship. Sign with
  the role and the model that wrote it, e.g. `— Reviewer (<model>)`.
- A **BLOCK** is not overridden by the implementer — it goes to the owner.

## How work flows

- **Design, when the change is big enough to need one.** Write it as a GitHub
  issue: the problem and why now; findings grounded in the code with `file:line`
  references, each claim verifiable; the proposed design; and explicit open
  questions. Owner decisions in it wait for the owner; nothing else waits for a
  review.
- **Implementation as a PR** that references the issue, if there is one. The
  owner merges when CI is green on the PR's final commit.
- **After the owner merges**: `git switch master && git pull --ff-only`, then
  delete the merged branch.
- **Worktrees are ad hoc**: use one only to work in parallel with another
  session. Make it beside the main checkout, and install the dependencies in it
  as CI does (`npm ci`, then `npx playwright install chromium`). Never copy or
  link `node_modules` from the main checkout. Remove the worktree after the
  merge, and remove no worktree you did not make. On Windows, nested paths need
  `git config --global core.longpaths true`, which the owner sets.
- **No per-PR review.** The independent review runs once per release, before
  its tag.

A change to `AGENTS.md` or `CLAUDE.md` is an ordinary PR: it merges on green CI.

## Releases

A release is a milestone: an annotated `vX.Y` tag — the scheme the releases
repository already uses — on `master`, on the exact commit the published APK is
built from. Not a PR, a run of PRs, or a change to a particular file. Only
stable releases, unless the owner says otherwise; a beta may be built from a
candidate. The APK is published in `diegoami/balloons-js-releases`, but the tag
goes here, and the release notes name the tagged commit.

The first tag, **`v2.4` on `2476864`** (the merge of #60), was put on after the
fact: the 2.4 notes name no commit, and `2476864` has the same files as the
version bump `272270a` that #60 records the APK being built from. The owner
confirmed it on 2026-09-23. Every release since has been tagged by the steps
below.

Read the version numbers from git, not from this file. The previous tag is
`git describe --tags --abbrev=0 origin/master`, and the next milestone is the
next minor version after it unless the owner names another. A number written
here goes stale with the next release: "the next milestone is `v2.5`" outlived
2.5, and the release steps in `android/README.md` said `v2.5` literally until
#77 and #78.

How a milestone happens:

1. The owner calls one, or the implementer proposes one when a release is due
   or a coherent set of work has landed.
2. The version bump merges as an ordinary PR (`android/README.md`, Releasing),
   because the APK is built from the tagged commit and has to carry its
   version. That merge commit on `master` is the **candidate**.
3. The implementer opens a milestone issue titled `[Milestone] vX.Y`: the
   proposed tag, the candidate's full SHA, the previous tag, the review round,
   the PRs merged between them, CI's results on the candidate (the push run on
   `master`), the candidate APK's full path and SHA-256, and what changed. The
   `review-handoff` skill fills it in.
4. **The independent review, before the tag.** Treat it as a real gate: it has
   caught defects that got past the author. A model that implemented none of
   the release reviews `git diff <previous tag>..<candidate>` in a fresh
   session, opens one issue per finding it reproduced, and posts one verdict
   comment, `AGREE` or `BLOCK`, on the milestone issue. The owner starts it with
   `opencode run -m <provider/model> --command review-release <issue>`, or
   `/review-release <issue>` in the TUI, on a model the owner picks. The
   reviewer follows `.opencode/agents/release-reviewer.md`. Neither the command
   nor the agent sets a model: one set there would override the owner's pick.
5. **The tag waits for the review; merges never do.** On `BLOCK`, reproduce
   each finding before acting on it (below), fix what holds up in ordinary PRs
   that reference the finding's issue, and take a finding you think is wrong to
   the owner with your repro. The candidate moves to the new `master` commit:
   update the milestone issue and start the re-review without being asked. A
   third round that does not end in `AGREE` goes to the owner.
6. On `AGREE`, the implementer tags exactly the reviewed SHA — never a later
   commit — and pushes the tag; the APK is built from the tag. Work merged after
   the candidate belongs to the next milestone. Anything that has to be played
   or installed to be checked is done before tagging. Publishing the APK stays
   with the owner.
7. The owner may tag without a review; the milestone issue records that.

When the review is in, read it from GitHub and reproduce each finding before
acting on it. Then fix it in a PR (`Fixes #n`), or rebut it with evidence on the
issue. Owner decisions go to the owner with a recommended default, not into the
code.

Write issue and PR bodies to a file and pass them with `--body-file`, as UTF-8
without a byte-order mark. And do not write `close`, `fix` or `resolve` followed
by `#N` in one unless you mean it: GitHub treats that as an instruction, and
#64's "closes #62 as superseded" closed #62 on merge.

## One source of truth

| Path | What it is |
|---|---|
| `public/` | The game. Edit here, always. |
| `android/app/src/main/assets/www/` | **A copy of `public/`.** Never edit, never cite. |
| `public/favicon.ico`, `public/apple-touch-icon.png` | Generated from `public/favicon.svg` by `tools/make-favicon.mjs`. |
| `package-lock.json` | Generated by npm. Marked `-diff`, so `git diff` shows it as binary. |

The Android mirror is written by the `copyGame` Gradle task
(`android/app/build.gradle.kts:71`) before every build, and is gitignored, so
`git ls-files android/app/src/main/assets` is empty and ripgrep skips it.

That covers the default search path and nothing else. After a release build
there are **two** shadow copies, not one — the Gradle intermediates hold a
third copy of every file. Searching the repository root for `Ladder.skin`:

| | files matched |
|---|---|
| `rg -l` | **4** — three in `public/js`, plus this file for naming the symbol |
| `grep -rl` | 10 — the same four, and each of the three copied twice more |

The six extra are `android/app/src/main/assets/www/` and
`android/app/build/intermediates/assets/release/mergeReleaseAssets/www/`.
Both are gitignored, so ripgrep skips them; `grep -r`, `find .` and `ls -R`
do not read gitignore and will return all three copies of everything.

So prefer `rg`. If you must use `grep -r` or `find`, scope it to `public`,
`netlify`, `test`, `tools` or `android/app/src/main/java` rather than running
it at the root. A hit under either `assets` path is a copy of a file in
`public/`; go and read the original.

## Never read, never echo

These are gitignored and hold live secrets or one machine's paths:

```
android/keystore.properties    android/*.jks
android/local.properties       .env  .env.*
```

`android/keystore.properties.example` is the tracked, empty one — use that to
explain the format. Do not generate signing keys; the keystore is the app's
permanent identity and it is the owner's to create.

## Not worth reading

`node_modules/`, `.netlify/`, `android/.gradle/`, `android/build/`,
`android/app/build/`, `.idea/`, `public/fonts/*.woff2`, and any `.png`, `.ico`
or `.woff2`. None of them answer a question about behaviour.

## Big files

`test/browser.test.mjs` is about 5,400 lines and holds the whole browser suite.
Do not read it whole. Each test is registered as `t('name', ...)`, so grep the
name and read a window around it. The largest modules, for the same reason, as
of 2.4 (`wc -l public/js/*.js | sort -rn` gives today's):

```
public/js/game.js     1043    public/js/gameballoons.js   445
public/js/layout.js   1002    public/js/screens.js        436
public/js/paint.js     936    public/js/ladder.js         413
public/js/sky.js       502    public/js/input.js          384
```

`public/js/ladder.js` is the exception: it is a twenty-row table and the prose
around it explains the tuning, so read it whole before changing any number in
it. Adding a column is the established way to add a mechanic.

## Commands

| Command | What it does | Output |
|---|---|---|
| `npm run check` | Syntax-checks all 20 modules, and that `index.html` loads exactly those. | One line. |
| `npm run test:scores` | The score function against an in-memory blob store. | ~30 lines. |
| `npm run test:browser` | The game in headless Chromium. Minutes. | One line per test. |
| `npm test` | `check`, then both suites. The gate before any push. | As above. |
| `npm run dev` | `netlify dev`, serving the site and the function. | Long-running; do not block on it. |
| `npm run playtest` | A bot with human reaction time, reporting on tuning. Asserts nothing. | See README. |

`npm run test:browser` binds **port 8899**, and nothing else does, so two
browser suites at once will collide -- the second fails `EADDRINUSE` and
prints nothing useful. Run one at a time.

`npm run playtest` defaults to **8910** and takes `--port`, which exists so
that several viewport sizes can be measured concurrently
(`tools/playtest.mjs:52`). Sweeps in parallel are fine; give each its own
port.

## Decided, and not to be re-opened

**The tuning is closed, again.** 2.1 was accepted on 2026-09-19. The owner
then played it, reopened the tuning, and 2.2 shipped the rebalance designed and
reviewed in issue #46. Do not propose re-tuning the ladder unless they raise it
again. The measured outcomes as of 2.2, so that a later reading does not mistake
them for a bug:

- a careful mouse (bot at 12px aim error) wins most runs, all 20 levels; a run
  can still hit the cap rather than finish
- one thumb (40px aim error) dies somewhere between levels 7 and 15
- two thumbs roughly doubles the tap rate, which is why the splash says
  "Best played on a tablet"

There is deliberately no middle ground: precise players finish, imprecise ones
do not. That is the intended shape. The `ladder.js` comments now describe the
2.2 table and the measured `SKY`; issue #46 holds the evidence.

## Principles

- Keep reviewer requirements separate from **owner decisions**, and put owner
  decisions to the human with a recommended default.
- Reproduce every finding before acting on it, **and reproduce your own before
  publishing it**. When a check fails, suspect your harness first — run old and
  new side by side, because a broken harness shows up as both columns agreeing
  when they should differ. Both sides once published a findings table from a
  test that had never run the fault, each testing the fault it thought of, so
  the test set inherited the blind spot from the thing it was testing.
- For each passing check, say what it would have caught had the code been
  wrong. Never let implementer and reviewer share a blind spot.
- A passing test is not a working feature: assert what a person would notice —
  pixels, contrast, timing — then go and play it.
- A threshold taken from one measurement is a coin toss.
- Flag out-of-scope defects rather than fixing them silently; if a fix turns
  out bigger than flagged, fix it fully — a fix that is four errors where two
  were flagged means fixing all four. Half a correction is not what anyone
  wanted.
- Show diffs, not whole files, and do not re-echo a file you just edited; quote
  the few lines a claim rests on, not the surrounding hundred.

## Knowing a change works

Climb the ladder: `npm run check` for syntax, `npm run test:scores` for the
function, `npm test` before pushing.

Two things this repository has learned the hard way:

**A threshold taken from one measurement is a coin toss.** Four assertions
were once set from a single run and all four passed by luck; one measured 95%
where the real spread reached 82%. Take a distribution, then set the bound
outside it.

**A passing test is not a working feature.** Birds, fireflies and fading
balloons all shipped inert with 129 tests green, because every test asserted
that the code did what it said rather than that a player could tell. When a
change is meant to be noticed, assert the thing a person would notice — pixels,
contrast, timing — and then go and play it.

Run `npm test` **eight times** before pushing anything that touches game logic,
and read the pass COUNT rather than the absence of a FAIL line. The browser
suite has timing in it, and three passes once let a one-in-eight flake through
twice. Re-run after the last edit, not before — a green run from before the
final change has verified nothing.

A change that touches no file under `public/` or `netlify/` cannot move any of
that timing, and one pass plus the diff is proportionate. Say which you did
rather than implying the higher bar.

CI (`.github/workflows/test.yml`) runs `npm test` eight times on every PR — on
GitHub's merge of it into `master`, filed under the head commit — and re-runs on
every push. That, not a count in the PR body, is the record a merge rests on: a
body is written once, and the fixes a review asks for land after it.

What runs on a pull request is GitHub's merge of the head into `master` as
`master` stood at the push that started it — the code that would land. If
`master` moves before merging, update the branch (`gh pr update-branch N`),
which pushes and so tests a fresh merge; a re-run does not, because it reuses
the merge it had. A PR is ready to merge when all eight are green on its final
commit. A count written into a PR body describes whichever commit was current
when it was written — after a review round, usually not the last one.

GitHub enforces this. Since 2026-09-24, `master`'s branch protection requires
all eight checks, `npm test (1/8)` to `npm test (8/8)`, from GitHub Actions, on
a branch that is up to date with `master`. A PR whose checks are red or pending,
or whose branch is behind, cannot be merged. The owner can override as an admin;
do not use `gh pr merge --admin` unless they say so. A required check is matched
by its **name**, so renaming the job or changing the matrix leaves every PR
waiting forever for checks that no longer exist. Change the protection rule in
the same step.

Each run must print exactly the pass counts in the workflow's `EXPECT_SCORES`
and `EXPECT_BROWSER`, because a test that stops registering still exits 0. A
PR that adds or removes a test updates them in the same commit.
