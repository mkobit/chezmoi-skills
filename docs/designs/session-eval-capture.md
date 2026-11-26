# Capture personal sessions for skill evaluation

## Problem

When a dotfiles task stalls, the user notices the extra work.
Tasks that go well can pass without comment.
Sampling only sessions with a known problem leaves out ordinary outcomes and makes it hard to see which behaviors the skills already support.

## Workflow

1. The user enables `CHEZMOI_ENABLE_PERSONAL_SESSION_EVAL_CAPTURE=1` in the personal environment that runs Codex. Leave it unset in overlays.
2. The dotfiles repo's Codex `SessionEnd` hook checks the opt-in and the Git repository of the session. Use Git identity so a session in the nested chezmoi source tree or a linked worktree can qualify.
3. The hook hashes the session ID into a fixed bucket and saves one local record for each selected ID. A resume keeps the same bucket. The hook leaves the original prompt and transcript unchanged.
4. The user runs the dotfiles review command and accepts or declines a candidate. On acceptance the command finds the skills checkout and starts a native Codex fork in that directory with the review skill as the initial prompt.
5. The review skill uses the fork's conversation history to draft one redacted eval case. It stages the candidate under the ignored `eval_results/` directory. The maintainer can promote it after review and run the existing eval checks.

The dotfiles repo owns selection and the review command.
This repo owns the [review skill](../../.agents/skills/session-eval-review/SKILL.md), the [corpus contract](../eval-corpus.md), and the live eval runner.
The repos pass a session ID to Codex. No tool copies or parses the transcript.

## Measure the trial

Check that selected sessions include ordinary work and that a reviewer can produce a repeatable case from an accepted session.
Record observed success, intervention, or an unknown outcome when reviewing the sample.
Report how many selected sessions were reviewed when comparing outcomes. The choice to accept a sample can bias the result.
Use the same harness, model, and corpus to compare skill revisions with a live baseline. [Live benchmark guide](../live-benchmark.md)

## Alternatives

A prompt at session start would tell the agent about the eval and can change the behavior under review.
A terminal prompt immediately after Codex exits depends on when `SessionEnd` runs and on how the user starts Codex.
Codex can end an idle session after a delay, so use an explicit review command that works after the event arrives. [Codex hooks](https://learn.chatgpt.com/docs/hooks#sessionend)

A native fork uses Codex's session history and avoids a parser for a changing transcript format.
If the source session is unavailable, the user needs to choose another session.
Other harnesses can use the same review criteria when they provide a way to recover session context. They are outside this first trial.
