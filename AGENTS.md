> Guidance for OpenCode. Claude Code uses `CLAUDE.md`.

# Working with a reviewer

DeepSeek implements. Review by another model is **non-blocking**: it runs when
the owner has the chance, lives in a GitHub issue, and nothing waits for it.
This file describes that process; the product guidance — what to read, what
to leave alone, what has already been decided, how to know a change works — is
in `CLAUDE.md` and applies here too.

## Roles

- **Implementer:** DeepSeek (`opencode/deepseek-v4.1-flash`). Writes the
  design, the code and the tests; replies on GitHub signed
  `— Implementer (DeepSeek V4.1 Flash)`.
- **Reviewer:** the owner's choice — Luna (`opencode/gpt-5.6-luna`, `high`
  variant, invoked as a subagent in a fresh context with that explicit model
  id), Codex, or another. It verifies against the real code rather than
  trusting the description, and posts its findings on the review issue.
- Reviewers post through the owner's GitHub account — there is no separate bot
  identity — so each signs its comments on the last line, e.g.
  `— Luna (GPT-5.6, high)`. That signature line is the only marker of
  authorship.

## The process

1. **Design, when the change is big enough to need one.** Write it as a GitHub
   issue: the problem and why now; findings grounded in the code with
   `file:line` references, each claim verifiable; the proposed design; and
   explicit open questions. Owner decisions in it wait for the owner; nothing
   else waits for a review.
2. **Implementation as a PR** that references the issue, if there is one. The
   owner merges when CI is green on the PR's final commit.
3. **Review at milestones, in an issue.** At a milestone, open a `[Review]`
   issue whose body is `docs/review-prompt.md` filled in and otherwise
   unchanged. `CLAUDE.md` (Review) says what a milestone is, and how the range
   and the one-waiting-at-a-time rule work; Claude Code opens the same issues,
   so a review covers whatever landed on `master`, whoever wrote it.
4. **Findings.** Reproduce each one before acting on it. Fix what holds up in a
   PR that references the review issue, and reply on the issue to every
   finding — what you fixed, or why not. A finding you think is wrong goes to
   the owner with your repro. Close the issue when every finding is fixed or
   answered.

A change to `AGENTS.md` or `CLAUDE.md` is a milestone like any other: it merges
on green CI, and its review comes after.

## Principles

- Keep reviewer requirements separate from **owner decisions**, and put owner
  decisions to the human with a recommended default.
- Reproduce every finding before acting on it, **and reproduce your own before
  publishing it**. When a check fails, suspect your harness first — run old and
  new side by side, because a broken harness shows up as both columns agreeing
  when they should differ.
- For each passing check, say what it would have caught had the code been
  wrong. Never let implementer and reviewer share a blind spot.
- A passing test is not a working feature: assert what a person would notice —
  pixels, contrast, timing — then go and play it.
- A threshold taken from one measurement is a coin toss.
- Flag out-of-scope defects rather than fixing them silently; if a fix turns
  out bigger than flagged, fix it fully.
- Show diffs, not whole files, and do not re-echo a file you just edited.

## Verification

Climb the ladder: `npm run check`, then `npm run test:scores`, then `npm test`
before pushing. Run the full suite **eight times** before pushing anything that
touches game logic, and read the pass COUNT rather than the absence of a FAIL
line. A change that touches no file under `public/` or `netlify/` cannot move
timing; one pass plus the diff is proportionate there — say which you did.

CI (`.github/workflows/test.yml`) runs `npm test` eight times on every PR —
on GitHub's merge of it into `master`, filed under the head commit — and
re-runs on every push. That, not a count in the PR body, is the record a merge
rests on: a body is written once, and the fixes a review asks for land after
it. Each run must print exactly the workflow's `EXPECT_SCORES` and
`EXPECT_BROWSER` counts; a PR that adds or removes a test updates them.
