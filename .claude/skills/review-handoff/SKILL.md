---
name: review-handoff
description: Prepare a release for its independent review - open the milestone issue with everything the reviewer needs, and give the owner the one command that starts the review on a model of their choice. Use when a release is called or proposed, for the re-review after a BLOCK, and whenever the owner asks for a review. Also use when the owner says a review is in, to process it.
---

# Review handoff

Only a release gets this review (`AGENTS.md`, Releases). A PR or a proposal
doesn't: say how it was verified instead.

The reviewer's job is written once, in `.opencode/agents/release-reviewer.md`.
It starts with no context and reads everything from the milestone issue, so
the issue has to carry everything it needs.

## Open the milestone issue

Title `[Milestone] vX.Y`, body passed with `--body-file` as UTF-8 without a
byte-order mark:

- **Tag**: `vX.Y`, the next in the existing scheme (the next minor after
  `git describe --tags --abbrev=0 origin/master`) unless the owner says
  otherwise.
- **Candidate**: the full SHA on `master` after a fetch. It is the merge commit
  of the version-bump PR (`android/README.md`, Releasing).
- **Previous milestone**: the latest `v*` tag, `git describe --tags --abbrev=0`.
- **Round**: 1 for a first review, 2 or 3 for a re-review after a `BLOCK`.
- **Merged since**: every PR merged between the two, number and title.
- **Implementer**: the tool and model that did the work.
- **Gates on the candidate**: each command, its pass count, what it would have
  caught, and CI's result for that SHA (the push run on `master`).
- **Candidate APK**: its full path on the owner's machine and its SHA-256, so
  the reviewer can build its own and compare.
- **What changed**: two or three sentences across the range. Do not argue for
  it.
- **Claims to verify**: what the release claims is true, with `file:line`.
- **Known owner decisions**: settled questions, so they aren't reported as
  defects, or "none".
- **Review**: `pending`, then `AGREE at <sha>`, `BLOCK at <sha>: #n` or
  `tagged without review (owner)`. Keep it current.

## Give the owner the command

Pick a reviewer model that implemented none of the release. Then, from the main
checkout, start it in a fresh session:

```sh
opencode run -m <provider/model> --command review-release <issue number>
```

In the TUI, use `/new`, pick the model with `/models`, then run
`/review-release <issue number>`. Neither the command nor the agent sets a
model, so the one picked here is the one used. With another tool, tell it:
"Follow `.opencode/agents/release-reviewer.md` for milestone issue #n."

For a re-review, first move **Candidate** to the new `master` commit, and add
the earlier verdict and the fix PRs to the issue. Then give the same command
again, in a fresh session.

## When the review is in

- Read the verdict comment on the milestone issue and every issue it lists
  (`gh issue view <n>`), and update the issue's `Review:` line. Check that the
  SHA it names is the current candidate.
- Reproduce each finding yourself before acting on it. A reviewer can be wrong,
  and so can you.
- MUST-FIX: fix it in an ordinary PR (`Fixes #n`), or rebut it with evidence on
  the issue and leave the close to the owner. SHOULD: recommend whether it goes
  in before the tag; the owner decides. OUT OF SCOPE: leave it for its own
  change. Owner decisions: put them to the owner with a recommended default.
  Nits: your call, and say which you took.
- Reply on the milestone issue with what happened to each finding.
- **BLOCK**: once the fixes merge, move the candidate to the new `master`
  commit on the issue, rerun the gates there, and start the re-review without
  being asked. If a third round does not end in AGREE, the milestone goes to
  the owner.
- **AGREE**: tag exactly the reviewed SHA and push the tag; the APK is built
  from the tag. Publishing to `diegoami/balloons-js-releases` stays with the
  owner.
