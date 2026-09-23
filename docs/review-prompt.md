# Review prompt

The body of a `[Review]` issue, which Claude Code opens at a milestone (see
`CLAUDE.md`, Review). The owner runs an independent model on it when they have
the chance — Codex, Luna, whichever they pick — by pointing it at the issue or
pasting the block below. The review is non-blocking: by the time it runs, the
code it covers has usually been merged, and its findings become follow-up work.

Fill in the `{braces}` and change nothing else. The prompt is fixed so that the
author of a change does not get to decide what its reviewer looks for; framing
is where a shared blind spot gets in. If the template itself is wrong, change
it in a PR of its own, and that PR is a milestone.

- `{BASE_SHA}` is the `{HEAD_SHA}` of the previous `[Review]` issue — or its
  `{BASE_SHA}`, if that one was superseded unreviewed.
- `{PRS}` lists the merged PRs in the range, one line each: link and title.
- `{AUTHOR_CLAIMS}` is what the author says it did and verified — tests run,
  counts, what was compared with what — one line each. It goes in as claims for
  the reviewer to check, never as evidence that something works.
- `{ISSUE_URL}` is the issue itself: open it, then edit the body to fill it in.

```text
You are reviewing the repository diegoami/balloons-JS at commit {HEAD_SHA} on
master. A different model wrote the changes under review, and you did not
write any of them. Your job is to find what is wrong, not to confirm what is
right.

Scope: {BASE_SHA}..{HEAD_SHA}, which merged:
{PRS}
Start there, and follow anything it touches into the rest of the repository;
a defect you find outside the range counts, marked as such.

Read CLAUDE.md first. It says what to read, what never to read or print (the
keystore, keystore.properties, local.properties, .env), what has already been
decided and is not to be reopened, and how a change is verified. PR
descriptions, README.md and docs/ are background: claims, not evidence.

The author says:
{AUTHOR_CLAIMS}
Treat every one of those as a claim to check.

How to review:
- Verify against the code and by running it, not against any description.
- Reproduce every finding before reporting it. Run the old and the new side
  by side (a git worktree at {BASE_SHA} is one way): a check that gives the
  same answer on both has tested nothing.
- The ladder: `npm run check`, `npm run test:scores`, then `npm test`. The
  browser suite binds port 8899, so run one at a time. CI ran `npm test`
  eight times on each PR and again on each push to master; the results and
  pass counts are on the PRs and on the master runs.
- For anything a player can see, check what a player would notice — pixels,
  contrast, timing — not only that the code does what it says.
- If you cannot run something (no network, no browser), say so and say what
  you did instead. Do not report a guess as a result.
- Do not commit, push, or edit files in the repository. You report; the
  author fixes, in a PR that references this issue.

Report, in this order:
1. Findings, most severe first. For each: file:line, what is wrong, how you
   reproduced it (the command and what it printed), what would fix it, and
   whether it needs fixing now or can wait.
2. Defects outside the scope, marked as such.
3. Decisions that belong to the owner rather than the author, each with a
   recommended default.
4. The commit you reviewed, and one line: nothing to act on, or which
   findings to act on first.

Post the report as one comment on {ISSUE_URL} (`gh issue comment`), signed on
its last line `— {your model name}`. If you cannot post, print it and the
owner will.
```
