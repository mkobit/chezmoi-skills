# Harness-driven local evaluation runner

* **Author**: Mike Kobit
* **Status**: Draft
* **Date**: 2026-11-22

--------------------------------------------------------------------------------

## Overview

This design replaces the never-baselined direct-API evaluation pipeline in `promptfooconfig.yaml` with an on-demand local evaluation runner driven by the `codex` (OpenAI Codex CLI) and `agy` (Antigravity CLI) agent harnesses.
The runner executes contrived cases and distilled `chezmoi cd` session cases from `tests/evals/*.json` using existing local harness authentication without paid API keys or CI execution.
Phase 1 proves the `codex` harness adapter end-to-end with targeted filtering (`--smoke`, `--skill`, `--case`) before adding `agy`, `--baseline` diffing, or retiring legacy Promptfoo scripts in phase 2.
Each case runs in an isolated workspace with a `PATH`-shimmed `chezmoi` binary that logs arguments and returns canned outputs, then emits a run summary under `eval_results/`.

## The problem

The repository has a never-baselined Promptfoo evaluation setup (`promptfooconfig.yaml`, `scripts/evals/generate-promptfoo-evals.ts`, `scripts/evals/prepare-live-benchmark.ts`) that requires paid API keys (`google:gemini-3.8-flash` and `anthropic:messages:claude-sonnet-4-6`), contains Promptfoo version drift (`0.123.1` in `prepare-live-benchmark.ts` vs. `0.125.1` in `package.json`), and has never produced a baseline run.
[live-benchmark.md](../live-benchmark.md) prohibits automating personal Codex allowances for repository benchmarks in CI or unattended schedules, and zero tooling tests how real agent harnesses (`codex` and `agy`) discover skills, read `references/*.md`, or construct `chezmoi` commands.

## Goals

* **Zero-API-key harness execution**: Run evaluations on demand through locally installed `codex` or `agy` CLIs using existing local authentication.
* **Single-harness phase 1**: Prove the `codex` adapter end-to-end before adding `agy`, using targeted filters (`--smoke`, `--skill`, `--case`) to control token usage.
* **Workspace and dotfile isolation**: Execute harnesses in a per-case temporary working directory outside the repository with a `PATH`-shimmed `chezmoi` binary that logs commands and returns canned stdout, stderr, and exit codes.
* **Behavioral verification**: Verify skill routing (`SKILL.md` discovery/read), progressive reference reads (`references/*.md`), and expected `chezmoi` command and argument patterns.
* **Run summaries**: Emit structured run artifacts (with git SHA, dirty status, harness version, skill hash, corpus hash, and failed case IDs) under `eval_results/` so runs can be compared over time.
* **Reuse existing repo assets**: Reuse `tests/evals/*.json`, `scripts/evals/eval-assertions.cjs` (`answerQualityMatches` logic), `scripts/evals/test-contracts.ts` schemas, and hashing helpers from `scripts/evals/prepare-live-benchmark.ts`.

## Non-goals

* **Paid API runs or CI harness execution**: CI remains static/local (`bun test`, `bun run validate`, `bun run test:contracts`, `bun run eval:validate`) with no model calls.
* **Unattended personal-allowance automation**: Scheduled or CI runs against personal `codex` or `agy` allowances remain prohibited.
* **Live dotfiles mutations**: No evaluation case may read or modify the maintainer's real `$HOME` or live `chezmoi` source directory.
* **Dual-harness, multi-turn, or baseline-diff rollout in phase 1**: Defer `agy`, multi-turn `turns[]` session chaining, `--baseline` diffing, shared `fixture_ref` catalogs, and expanded `extract-transcript-evals.ts` distillation until single-turn `codex` evaluation passes end-to-end.
* **Custom internal tool-RPC mocking**: Do not intercept `codex` or `agy` internal file-reading tools; test real skill and reference discovery against an isolated workspace.

## Critical user journeys (CUJs)

### CUJ 1: Run a targeted local evaluation without API keys

* **Given**: The maintainer edited a skill under `skills/` and has `codex` authenticated locally (recommended inside a `.sbx/` sandbox).
* **When**: The maintainer runs `bun run eval:local` with a filter (`--skill`, `--case`, or `--smoke`) and optional `--dry-run`.
* **Then**: The runner prepares a per-case isolated workspace with a mocked `chezmoi` binary on `PATH`, invokes `codex exec` non-interactively, checks skill routing, reference reads, command invocations, and deterministic answer quality, prints pass/fail per case, and writes `summary.json` under `eval_results/runs/<timestamp>/`.

### CUJ 2: Compare runs after skill edits (phase 2)

* **Given**: The maintainer has saved `summary.json` artifacts from prior `eval:local` runs.
* **When**: The maintainer runs `eval:local --baseline <artifact>` after editing a skill.
* **Then**: The runner reports `new_failures`, `new_passes`, and `unchanged_failures` relative to the baseline and warns on `corpus_sha256` or `harness_version` drift.

## Technical plan

### High-level data flow

```text
tests/evals/*.json (existing TestCaseSchema + optional smoke/mock_responses/required_references)
        │
        ▼
[1. Preflight & filter] (--harness codex, --skill, --case, --smoke, --dry-run)
        │  AND-combined filters; verify codex exec flags & auth.json
        ▼
[2. Per-case isolated root] (/tmp/chezmoi-evals-<run_id>/cases/<case_id>/, mode 0700)
    ├── work/ (.agents/skills/, context_files, isolated HOME/XDG/CHEZMOI_*)
    ├── meta/ (bin/chezmoi Bun shim, mock rules JSON, append-only shim JSONL log)
    └── per-run isolated CODEX_HOME (auth.json copy only; no user skills/sessions)
        │
        ▼
[3. Harness adapter (phase 1: codex exec --json --ephemeral; phase 2: agy)]
        │  emits JSONL event stream + shim call log
        ▼
[4. Normalized trace parser]
    ├── discovered_skills[], references_read[], commands_invoked[]
    └── mock_calls[] (matched_case | matched_default | unmocked_fallback), trace_violations[]
        │
        ▼
[5. Grader] (dispatched by eval_type)
    ├── skillRoutingMatches (discovered_skills + allow_clarification)
    ├── referenceReadsMatch (references_read)
    ├── commandMatches (commands_invoked, optional prose fallback)
    └── answerQualityMatches (deterministic substring/clarification check on final_response)
        │
        ▼
[6. Artifact emitter]
    └── eval_results/runs/<timestamp>/ (gitignored raw JSONL, shim logs, summary.json)
```

### Component design

1. **Unified corpus and mock schema (`tests/evals/*.json`)**
   * Keep existing `TestCaseSchema` fields (`id`, `name`, `eval_type` in `"trigger_matching" | "skill_selection" | "command_correctness" | "answer_quality"`, `target_skill`, `input.{user_prompt, context_files}`, `expected.{should_trigger, selected_skill, selected_skills, allow_clarification, exact_command, command_regex, required_flags, forbidden_flags, answer_quality}`) backward-compatible.
   * Add optional fields for harness-driven cases:
     * `origin`: Optional `"contrived" | "distilled"` (defaults to `"contrived"`).
     * `smoke`: Optional boolean (`true` marks cases selected by `--smoke`).
     * `expected.required_references`: Optional `string[]` of `references/*.md` paths (normalized to skill-relative paths) that must be read during execution; order-independent, extra reads allowed.
     * `mock_responses`: Optional `Array<{ match_args?: string[]; match_regex?: string; stdout?: string; stderr?: string; exit_code?: number }>` (at least one matcher required). Exact `match_args` entries (`argv.slice(1)`) are checked before `match_regex` entries (matched against `argv.slice(1).join(" ")`) in array order. Shared `fixture_ref` catalogs are deferred to phase 2.

2. **Workspace isolation, `CODEX_HOME`, and `chezmoi` `PATH` shim**
   * **Execution environment**: Document `.sbx/` ([sbxenv.yaml](../../.sbx/sbxenv.yaml)) as the recommended execution environment instead of coupling `runner.ts` to runtime sandbox markers. Flag any agent read of `meta/` or the bind-mounted repo `tests/evals/` directory in `trace_violations[]` as a test failure.
   * **Isolated `CODEX_HOME` and workspace**: Create a `0700` per-run directory under `/tmp/chezmoi-evals-<run_id>/` (cleaned up on exit/SIGINT/SIGTERM unless `--keep-workdir` is passed) with a `CODEX_HOME` containing only a copy of `auth.json` (resolved from `$CODEX_HOME/auth.json` or `$HOME/.codex/auth.json`; fail fast if absent). Place each case's `work/` directory at `/tmp/chezmoi-evals-<run_id>/cases/<case_id>/work/` with repo `skills/` copied into `work/.agents/skills/` and `input.context_files` materialized if present. Override `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `CHEZMOI_CONFIG_FILE`, and `CHEZMOI_SOURCE_DIR` into `work/`.
   * **`PATH` shim**: Place `bin/chezmoi` (`#!/usr/bin/env bun`), the mock rules JSON (`CHEZMOI_SHIM_RULES`), and the append-only shim JSONL log (`CHEZMOI_SHIM_LOG`) in a sibling `meta/` directory outside `work/` so workspace file discovery and relative-path reads do not expose them. Include built-in read-only defaults for `--version`, `--help`, `source-path`, `dump-config`, `data`, `managed`, and `status`. Unmatched invocations log `unmocked_fallback`, write a diagnostic to stderr, and exit `1`. Enforce a per-case shim call cap (`25` calls) to prevent retry loops.

3. **Harness adapter and normalized trace**
   * **Phase 1 (`codex`)**: Preflight-check `codex exec --help` for `--ignore-user-config` and `--ignore-rules`, then invoke `codex exec --json -C <work_dir> -s workspace-write --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check "<prompt>"` sequentially (`concurrency=1`) with a `90s` default per-case timeout. Abort early and write partial `summary.json` on auth or rate-limit errors.
   * **Phase 2 (`agy`)**: Add an `agy --print --output-format stream-json` adapter behind the same trace interface after the `codex` adapter is verified end-to-end.
   * **Normalized trace**: Parse the `codex` JSONL event stream (`item.completed` tool/shell events, `agent_message`, `turn.completed`) and the shim log into one trace per case: `discovered_skills[]` (`SKILL.md` reads), `references_read[]` (`references/*.md` reads), `commands_invoked[]`, `mock_calls[]`, `trace_violations[]`, `final_response`, `duration_ms`, and `usage` (nullable). Exact `codex` JSONL event field paths are verified against a `codex exec --json` smoke run during implementation.

4. **Grading and comparison artifacts**
   * `routerMatches` in [eval-assertions.cjs](../../scripts/evals/eval-assertions.cjs) parses strict Promptfoo JSON and `commandMatches` matches prose; replace them in `corpus.ts` with trace-backed `skillRoutingMatches(trace, expected)` (for `trigger_matching` / `skill_selection`) and `commandMatches(trace, expected)` (for `command_correctness`, checking `commands_invoked[]`, with `final_response` fallback only when `expected.allow_prose_command === true`). Keep `answerQualityMatches` as deterministic substring/clarification matching on `final_response` (for `answer_quality`), and run `referenceReadsMatch(trace, expected)` whenever `expected.required_references` is set.
   * Write raw harness JSONL, shim logs, and `summary.json` (`schema_version: "1"`, `commit_sha`, `git_dirty`, `harness_name`, `harness_version`, `model_id`, `skill_source_sha256`, `corpus_sha256`, `failed_case_ids`, `unmocked_fallback_count`, and per-case verdicts) to gitignored `eval_results/runs/<timestamp>/`.

5. **Promptfoo retirement (phase 2)**
   * Keep existing `test:contracts` and `eval:validate` working during phase 1. Once the `codex` runner is verified end-to-end, retire `promptfooconfig.yaml`, Promptfoo `package.json` scripts, `.github/workflows/ci.yml`'s Promptfoo validation step, `.github/workflows/eval-live.yml`, and legacy Promptfoo/metric scripts, and update [live-benchmark.md](../live-benchmark.md).

## Non-functional requirements

* **Security and privacy**: Distilled cases checked into `tests/evals/` must pass pattern checks in `test:contracts` and human `git diff` review before commit. Raw harness transcripts stay in gitignored `eval_results/`.
* **Quota and runtime safety**: Runs default to sequential execution (`concurrency=1`) with a `90s` per-case timeout, a `25`-call shim cap, rate-limit fail-fast, and `--dry-run` preflight listing the case count before invoking `codex`.
* **Reproducibility**: Every `summary.json` records git dirty state and content hashes (`skill_source_sha256`, `corpus_sha256`) so runs can be compared across commits.

## Alternatives considered

### Alternative A: Direct API providers in Promptfoo (`promptfooconfig.yaml`)

* **Pros**: Configuration and generator scripts (`scripts/evals/generate-promptfoo-evals.ts`, `scripts/evals/prepare-live-benchmark.ts`) already exist in the repository.
* **Cons**: Requires buying and managing paid API keys; hardcoded models (`google:gemini-3.8-flash`, `anthropic:messages:claude-sonnet-4-6`); does not test real agent harness skill discovery or tool use.
* **Reason for rejection**: Requires paid API keys and does not exercise real agent harness skill discovery or tool use.

### Alternative B: Wrapping `codex` and `agy` inside Promptfoo `exec` providers

* **Pros**: Keeps Promptfoo's output UI intact.
* **Cons**: Promptfoo expects single-turn prompt/completion strings, forcing translation boilerplate and `NODE_OPTIONS=-r ./scripts/evals/patch-version.cjs` workarounds (`0.123.1` vs `0.125.1` drift) without using Promptfoo's API matrix.
* **Reason for rejection**: A direct Bun runner reuses `tests/evals/*.json` and deterministic assertions with lower maintenance overhead.

### Alternative C: Environment overrides only without `.sbx/` recommendation

* **Pros**: Zero sandbox setup needed.
* **Cons**: Relies solely on environment variable overrides and Codex's built-in sandbox flags, leaving a residual risk of reading host files outside the temp directory.
* **Reason for rejection**: `.sbx/` sandboxing is recommended by default to isolate case execution from the host filesystem and configuration.

### Alternative D: Full live `chezmoi` execution instead of mocked responses

* **Pros**: Tests real `chezmoi` binary behavior and exit codes without maintaining mock fixture tables.
* **Cons**: Requires realistic target filesystem state, external age/gpg/keyring setup, and risks side effects if isolation is misconfigured.
* **Reason for rejection**: Canned inputs and outputs are sufficient for verifying skill routing, reference reads, and expected command patterns.

### Alternative E: Dual-harness rollout (`codex` and `agy` simultaneously in phase 1)

* **Pros**: Produces cross-harness comparison data immediately.
* **Cons**: Doubles adapter and trace-parser surface area before any eval runs in this repository.
* **Reason for rejection**: Prove `codex` end-to-end first, then add `agy` behind the same normalized trace interface in phase 2.

## Detailed implementation plan

Build the phase-1 `codex` runner (`scripts/evals/corpus.ts`, `scripts/evals/runner.ts`, `scripts/evals/cli.ts`) alongside existing scripts first, then retire Promptfoo and legacy metric/transcript scripts once end-to-end `codex` runs succeed.

### Target files

#### 1. `scripts/evals/corpus.ts` (Create)

* **Type / Scope**: Corpus, hashing, and assertion module.
* **What & Why**:
  * Consolidates `TestCaseSchema` and `AnswerQualitySchema` (adding optional `origin`, `smoke`, `expected.required_references`, `expected.allow_prose_command`, and `mock_responses`).
  * Extracts `sha256`, `listedFiles`, `listedFilesRecursive`, and `corpusHash` from `scripts/evals/prepare-live-benchmark.ts` (or a shared `hash.ts` helper) to compute `skill_source_sha256` and `corpus_sha256`.
  * Implements `skillRoutingMatches`, `referenceReadsMatch`, `commandMatches`, and `answerQualityMatches` (reusing `answerQualityMatches` logic from `eval-assertions.cjs`).

#### 2. `scripts/evals/runner.ts` (Create)

* **Type / Scope**: Workspace isolation, `chezmoi` shim, `codex` adapter, and trace/summary emitter.
* **What & Why**:
  * Verifies `codex exec --help` flags and `auth.json` presence (`$CODEX_HOME/auth.json` or `$HOME/.codex/auth.json`), sets up `0700` `/tmp/chezmoi-evals-<run_id>/` with cleanup handlers (`--keep-workdir` to retain).
  * Creates per-case `work/.agents/skills/` and `meta/bin/chezmoi` (`#!/usr/bin/env bun`) reading `CHEZMOI_SHIM_RULES` and appending to `CHEZMOI_SHIM_LOG`, with built-in read-only defaults and a `25`-call cap.
  * Invokes `codex exec --json --ephemeral ...` with a `90s` default timeout, aborts on auth/rate-limit errors, parses JSONL events and shim logs into normalized traces, and writes `eval_results/runs/<timestamp>/summary.json`.

#### 3. `scripts/evals/cli.ts` (Create)

* **Type / Scope**: `commander` CLI entry point.
* **What & Why**:
  * Exposes `run` (`--harness codex`, `--skill`, `--case`, `--smoke` combined with logical `AND`; `--dry-run` prints matched cases before `auth.json` setup; `--timeout <ms>` default `90000`; `--keep-workdir`) and `validate` (static schema validation over `tests/evals/*.json`).
  * Uses `program.exitOverride()` so `CommanderError` exits `2` (`0` all pass, `1` case failure, `2` usage/config error).

#### 4. `scripts/evals/test-contracts.ts` (Modify)

* **Type / Scope**: Static contract checks.
* **What & Why**: Replaces local `TestCaseSchema` and `AnswerQualitySchema` definitions with imports from `corpus.ts`, wraps both `program.parse(process.argv)` and `run()` in `if (import.meta.main)`, and updates the markdown summary footer (line 422) to reference `eval:local`.

#### 5. `tests/evals/*.json` (Modify)

* **Type / Scope**: Evaluation corpus.
* **What & Why**: Tags smoke subset cases with `smoke: true` and adds `mock_responses` / `expected.required_references` to target cases.

#### 6. `package.json` (Modify)

* **Type / Scope**: Package scripts.
* **What & Why**: Adds `"eval:local": "bun run scripts/evals/cli.ts run"` while keeping existing Promptfoo scripts intact until phase-2 retirement.

#### 7. `tests/eval-corpus.test.ts` and `tests/eval-runner.test.ts` (Create)

* **Type / Scope**: Bun unit tests.
* **What & Why**: Tests `TestCaseSchema` extensions, `skillRoutingMatches`, `referenceReadsMatch`, `commandMatches`, `answerQualityMatches`, mocked `codex` JSONL trace parsing, `chezmoi` shim matching/fallback/cap, and `summary.json` emission.

#### 8. Phase-2 cleanup (Deferred until phase-1 `codex` verification)

* **Type / Scope**: Promptfoo retirement, `agy` adapter, `--baseline` diffing, and documentation.
* **What & Why**: Removes `promptfoo` from `package.json`, `.github/workflows/ci.yml`'s Promptfoo step, `.github/workflows/eval-live.yml`, legacy Promptfoo/metric scripts (`promptfooconfig.yaml`, `generate-promptfoo-evals.ts`, `prepare-live-benchmark.ts`, `patch-version.cjs`, `eval-assertions.cjs`, `record-benchmark-metrics.ts`, `generate-history-index.ts`) and their coupled tests, updates `docs/live-benchmark.md`, and adds `agy`, `--baseline`, and `distill` enhancements.
