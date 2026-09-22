> Guidance for OpenCode. Claude Code uses `CLAUDE.md`.

# Working with a reviewer

DeepSeek implements, Luna reviews. This file describes the review process; the
product guidance — what to read, what to leave alone, what has already been
decided, how to know a change works — is in `CLAUDE.md` and applies here too.

## Roles

- **Implementer:** DeepSeek (`opencode/deepseek-v4.1-flash`). Writes the
  design, the code and the tests; replies on GitHub signed
  `— Implementer (DeepSeek V4.1 Flash)`.
- **Reviewer:** Luna (`opencode/gpt-5.6-luna`, `high` variant), invoked as a
  subagent in a fresh context with that explicit model id. It verifies against
  the real code rather than trusting the description, and posts its verdict on
  GitHub.
- Luna posts through the owner's GitHub account — there is no separate bot
  identity — so its comments are signed `— Luna (GPT-5.6, high)`. That
  signature line is the only marker of authorship.
- A `BLOCK` is not overridden by the implementer. It goes back to the owner.

## The process — two stages

1. **Design as an issue.** Before any implementation, write the proposal as a
   GitHub issue: the problem and why now; findings grounded in the code with
   `file:line` references, each claim verifiable; the proposed design; and
   explicit open questions. Have Luna review the issue and comment. Iterate —
   reply, Luna re-reviews — until Luna posts an explicit `AGREE`. Do not start
   implementation before that.
2. **Implementation as a PR.** Implement the agreed design on a branch and open
   a PR that references the issue. Have Luna review the PR against the agreed
   design; fix and iterate until Luna posts an explicit `AGREE`. The owner
   merges.

**Bootstrap.** A change to `AGENTS.md` or `CLAUDE.md` follows this same
process: it is opened as a PR and reviewed to `AGREE` like any other change.
The process reviews its own amendment.

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
