# Review prompt

The prompt the implementer gives the owner for a milestone review (see
`CLAUDE.md`, Review). A milestone is a release: the review runs on the
candidate commit, before the `vX.Y` tag, and the tag waits for its verdict.
The owner runs it in a model that is not Claude — Codex, Luna, whichever they
pick — in a fresh session.

Fill in the `{braces}` and change nothing else. The prompt is fixed so that the
author of a change does not get to decide what its reviewer looks for; framing
is where a shared blind spot gets in. If the template itself is wrong, change
it in a PR of its own.

- `{TAG}` is the proposed tag, `{PREV_TAG}` the last milestone's tag, and
  `{CANDIDATE_SHA}` the full SHA of the candidate on `master`.
- `{MILESTONE_ISSUE_URL}` is the `[Milestone] {TAG}` issue.
- `{ROUND}` is 1 for a first review, 2 or 3 for a re-review after a `BLOCK`.
- `{PRS}` lists the PRs merged in the range, one line each: link and title.
- `{AUTHOR_CLAIMS}` is what the implementer says it did and verified — tests
  run, counts, what was compared with what — one line each. It goes in as
  claims for the reviewer to check, never as evidence that something works.

```text
You are reviewing release {TAG} of the repository diegoami/balloons-JS. The
candidate is commit {CANDIDATE_SHA} on master; the previous release is
{PREV_TAG}. This is review round {ROUND}. A different model wrote the changes,
and you did not write any of them. Your job is to find what is wrong, not to
confirm what is right.

Check out the candidate, not master: master may have moved on, and later work
belongs to the next release. A fresh worktree is best:
  git fetch origin --tags
  git worktree add ../review-{TAG} {CANDIDATE_SHA}

Review `git diff {PREV_TAG}..{CANDIDATE_SHA}`, which merged:
{PRS}
Follow the diff into any file it touches; a defect you find outside the diff
counts, marked as such. On a re-review, also check that every finding issue
from earlier rounds is fixed at the candidate.

Read CLAUDE.md first. It says what to read, what never to read or print (the
keystore, keystore.properties, local.properties, .env), what has already been
decided and is not to be reopened, and how a change is verified. PR
descriptions, README.md and docs/ are background: claims, not evidence.

The implementer says:
{AUTHOR_CLAIMS}
Treat every one of those as a claim to check.

How to review:
- Verify against the code and by running it, not against any description.
- Reproduce every finding before reporting it. Run the old and the new side
  by side (a second worktree at {PREV_TAG}): a check that gives the same
  answer on both has tested nothing.
- The ladder: `npm run check`, `npm run test:scores`, then `npm test`. The
  browser suite binds port 8899, so run one at a time. CI ran `npm test`
  eight times on each PR and on each push to master; the run for the push of
  {CANDIDATE_SHA} is linked on the milestone issue.
- For anything a player can see, check what a player would notice — pixels,
  contrast, timing — not only that the code does what it says.
- If you cannot run something (no network, no browser), say so and say what
  you did instead. Do not report a guess as a result.
- Do not commit, push, tag, or edit files in the repository. You report; the
  implementer fixes.

Report:
1. One GitHub issue per finding you reproduced, titled `[{TAG}] <the finding>`:
   file:line, what is wrong, how you reproduced it (the command and what it
   printed), what would fix it, and a link to {MILESTONE_ISSUE_URL}.
2. One comment on {MILESTONE_ISSUE_URL} with: the commit you reviewed; the
   finding issues you opened; defects outside the diff, marked as such;
   decisions that belong to the owner rather than the implementer, each with
   a recommended default; and, on its own line, the verdict —
   AGREE (tag {CANDIDATE_SHA} as {TAG}) or BLOCK (a finding must be fixed
   first). Sign its last line `— {your model name}`.

Write every issue and comment body to a file as UTF-8 without a byte-order
mark, and pass it with --body-file (`gh issue create --title ... --body-file
FILE`, `gh issue comment {MILESTONE_ISSUE_URL} --body-file FILE`); never pass
a body inline. On Windows PowerShell 5.1, Out-File and Set-Content with
-Encoding utf8 both write a byte-order mark. Use
  [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
or write the file from Git Bash. If you cannot open issues, put everything in
one report and the owner will file it.
```
