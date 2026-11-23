# T3 evaluators for local harnesses

- **Author**: Mike Kobit
- **Status**: Proposed
- **Date**: 2026-11-23
- **Bead**: `cz-skl-dlr`

--------------------------------------------------------------------------------

## Overview

This design specifies three T3 evaluation workflows built on the Bun runner in `scripts/evals/`: post-hoc LLM-as-a-judge rubric grading, a multi-turn chatting user simulator, and a synthetic edge-case generator.
Each evaluator reuses existing local OAuth credentials for `codex` and `agy` with zero paid API keys, no Docker requirement, and no unattended CI execution.
All auxiliary T3 model calls enforce JSON schemas via Zod v4 (`z.toJSONSchema`) and run in isolated temporary directories so host dotfiles, `~/.codex`, and `~/.gemini` remain untouched.

## Goals

- **Zero API keys and zero new dependencies**: Execute judge, simulator, and generator calls through local `codex` and `agy` binaries using existing `zod`, `commander`, and Bun APIs.
- **Deterministic T2 precedence**: Treat T3 rubric grades as an additive semantic signal that never overrides failed T2 checks (`trace_violations`, `skill_routing`, `command_matches`, `reference_reads`, or `answer_quality`).
- **Strict workspace and credential isolation**: Isolate `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `CHEZMOI_CONFIG_FILE`, `CHEZMOI_SOURCE_DIR`, `CODEX_HOME`, and the `chezmoi` `PATH` shim per run and per case.
- **Bounded quota and runtime safety**: Keep every T3 workflow opt-in via explicit CLI flags, sequential (`concurrency=1`), timeout-bounded, and fail-fast on auth or rate-limit errors.
- **Human-gated synthetic expansion**: Stage generated test cases outside `tests/evals/` until automated schema, contract, deduplication, and security-lint gates pass and a maintainer approves the diff.

## Non-goals

- Running `codex` or `agy` model calls in GitHub Actions, scheduled jobs, or `mise run validate` / `test`.
- Adopting paid API SDKs or external evaluation frameworks (`skillgrade`, `skillEd`, Promptfoo, or Docker sandboxes).
- Implementing multi-agent evaluation swarms or autonomous skill self-editing loops.
- Auto-committing or auto-merging synthetic test cases into `tests/evals/*.json` without maintainer review.

## Shared architecture and isolation

All three T3 evaluators extend `scripts/evals/corpus.ts`, `scripts/evals/runner.ts`, and `scripts/evals/cli.ts` rather than spawning a separate runner stack.

```text
eval_results/runs/<timestamp>/summary.json + cases/<id>/{events,shim}.jsonl
        │
        ▼
[1. Post-hoc judge] (judge.ts) ──► eval_results/runs/<timestamp>/judge-summary.json
        ▲
        │ (optional --judge after run / simulate)
[2. Multi-turn simulator] (simulator.ts) ──► RunSummary + cases/<id>/transcript.json
        │
[3. Synthetic generator] (generator.ts)
        ├── reads skills/*/SKILL.md + references/*.md + tests/evals/*.json
        ├── runs schema + security-lint + deduplication + contract pre-checks
        └── writes eval_results/generated/<timestamp>-<skill>/cases.json (human review)
```

### Reusable harness helpers

Extract three small helpers from `scripts/evals/runner.ts` so T2 and T3 share identical OAuth and timeout behavior:

- `prepareIsolatedHarnessAuth(baseDir, harness)`: Creates a `0700` directory copying only `$CODEX_HOME/auth.json` (`0600`) for `codex` or `$HOME/.gemini/antigravity-cli/antigravity-oauth-token` (`0600`) for `agy`.
- `checkHarnessPreflight(harness, opts)`: Extends `checkCodexPreflight()` and `checkAgyPreflight()` to verify `--output-schema` / `-o` on `codex exec` and `--json-schema` / `--disable-slash-commands` / `--sandbox` on `agy` when structured output is requested.
- `invokeStructuredHarness(params)`: Writes a JSON Schema file derived from `z.toJSONSchema(schema, { unrepresentable: "any" })`, executes `codex` or `agy` in an empty read-only `0700` temporary directory without `.agents/skills/` or the `chezmoi` shim on `PATH`, strips optional Markdown code fences if needed, and validates the response with `schema.safeParse`.

### Environment isolation matrix

| Role | Harness sandbox | Isolated `HOME` / `CODEX_HOME` | `.agents/skills/` copied | `chezmoi` shim on `PATH` | Ephemeral session |
| --- | --- | --- | --- | --- | --- |
| Single-turn evaluated agent (T2) | `workspace-write` (`codex`) / permissions skipped (`agy`) | Per-run auth copy; `HOME` / `XDG_*` / `CHEZMOI_*` in `work/` or `caseDir` | Yes | Yes | Yes |
| Multi-turn evaluated agent (T3) | Same as T2 | Per-case auth copy (`cases/<id>/codex_home` or `agy_home`) | Yes | Yes | No (`resume` / `--conversation`) |
| LLM judge (T3) | `read-only` (`codex`) / `--sandbox` (`agy`) | Ephemeral per-run auth copy; empty `judge_work/` | No | No | Yes |
| User simulator (T3) | `read-only` (`codex`) / `--sandbox` (`agy`) | Ephemeral per-run auth copy; empty `sim/` | No | No | Yes |
| Synthetic generator (T3) | `read-only` (`codex`) / `--sandbox` (`agy`) | Ephemeral per-run auth copy; empty `gen_work/` | No | No | Yes |

### Minimal `TestCaseSchema` extensions

Extend `scripts/evals/corpus.ts` backward-compatibly so existing `tests/evals/*.json` files remain valid without edits:

```ts
export const RubricCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  critical: z.boolean().default(true),
});

export const RubricSchema = z.object({
  criteria: z.array(RubricCriterionSchema).min(1).max(8),
  min_pass_ratio: z.number().min(0).max(1).default(1),
  include_references: z.array(z.string().min(1)).optional(),
});

export const SimulationConfigSchema = z.object({
  persona: z.string().min(1),
  goal: z.string().min(1),
  scenario_facts: z.array(z.string().min(1)).min(1),
  max_turns: z.number().int().min(2).max(8).default(4),
  shim_call_cap: z.number().int().min(1).max(40).default(25),
});
```

Add three fields to `TestCaseSchema`:

- `origin`: Expand enum to `z.enum(["contrived", "distilled", "synthetic"]).default("contrived")`.
- `expected.rubric`: Optional `RubricSchema` for cases graded by the post-hoc LLM judge.
- `simulation`: Optional `SimulationConfigSchema` marking a case for multi-turn simulation.

--------------------------------------------------------------------------------

## 1. Post-hoc LLM-as-a-judge rubric grading

### Judge workflow

Post-hoc grading separates agent execution from semantic grading so maintainers can inspect or re-grade saved `eval_results/runs/<timestamp>/` runs without re-running the evaluated agent.

1. Load `summary.json`, matching `TestCase` definitions from `tests/evals/*.json`, and per-case logs (`<harness>-events.jsonl`, `shim.jsonl`, and optional `transcript.json`).
2. Filter to cases that define `expected.rubric` (or use an explicit `--rubric <file>` fallback), skipping cases that already failed T2 deterministic checks when `--only-passed` is set.
3. Build a compact prompt containing the original user prompt (or multi-turn transcript), normalized trace (`discovered_skills`, `references_read`, `commands_invoked`, `mock_calls`, `final_response`), any `rubric.include_references` Markdown excerpts, and the rubric criteria.
4. Invoke `codex exec` or `agy` in `read-only` / `--sandbox` mode with `--output-schema` / `--json-schema` (and `--disable-slash-commands` on `agy`), passing the prompt over stdin (`-` on `codex`) or a compact prompt payload.
5. Validate the structured JSON output with `JudgeVerdictSchema`, recompute `passed` deterministically from `criteria_results` (`critical` criteria and `min_pass_ratio`), and write `eval_results/runs/<timestamp>/judge-summary.json`.

### Judge CLI flags

Add a `judge` subcommand to `scripts/evals/cli.ts` (aliased as `eval:live:judge` in `package.json` and `mise.toml`) plus an optional `--judge` hook on `run` and `simulate`.

| Flag | Default | Purpose |
| --- | --- | --- |
| `--run <dir>` | Required unless `--calibrate` | Path to an existing `eval_results/runs/<timestamp>` directory |
| `--judge-harness <name>` | `"codex"` | Local harness used as judge (`codex` or `agy`) |
| `--judge-model <model>` | Harness default | Explicit model override (`-m` on `codex`, `--model` on `agy`) |
| `--rubric <file>` | None | Optional fallback `RubricSchema` JSON file for cases lacking `expected.rubric` |
| `--skill <skill>` | None | Filter graded cases by `target_skill` |
| `--case <id>` | None | Filter graded cases by case ID |
| `--only-passed` | `false` | Skip cases that already failed T2 deterministic assertions |
| `--judge-runs <n>` | `1` | Repeat grading (`1` or `3`) and take per-criterion majority vote |
| `--max-cases <n>` | Unlimited | Hard cap on judged cases in one invocation |
| `--timeout <ms>` | `60000` | Per-case judge timeout in milliseconds |
| `--calibrate` | `false` | Run judge against `tests/fixtures/judge_calibration.json` golden verdicts |
| `--dry-run` | `false` | List cases eligible for judging without invoking any model |
| `--keep-workdir` | `false` | Retain temporary isolated judge workspace |

### Judge verdict and summary schemas

```ts
export const JudgeCriterionVerdictSchema = z.object({
  id: z.string().min(1),
  passed: z.boolean(),
  evidence_quotes: z.array(z.string()),
  reasoning: z.string().min(1),
});

export const JudgeVerdictSchema = z.object({
  case_id: z.string().min(1),
  passed: z.boolean(),
  criteria_results: z.array(JudgeCriterionVerdictSchema).min(1),
  summary: z.string().min(1),
});
```

Each entry in `judge-summary.json` records `schema_version: "1"`, `run_timestamp`, `judge_harness`, `judge_version`, `judge_model_id`, `rubric_sha256`, `judge_prompt_sha256`, `total_judged`, `passed_judged`, `failed_judged`, `error_judged`, `failed_judge_case_ids`, and per-case results with `verdict_status: "ok" | "error"`.
The runner overwrites `verdict.passed` with the deterministic calculation (`every critical criterion passed` AND `passedCount / criteria.length >= rubric.min_pass_ratio`) so arithmetic mistakes by the judge cannot pass a failing case.
Schema or parse failures set `verdict_status: "error"` and `passed: false` (fail-closed) and exit `1`.

### Calibration, drift, and cost guardrails

- **Cross-harness grading**: Allow judging a `codex` run with `--judge-harness agy` (and vice versa) to detect model-family self-preference bias.
- **Golden calibration set**: Maintain a small checked-in fixture file at `tests/fixtures/judge_calibration.json` (8 to 12 pinned `(trace, rubric, expected_passed, expected_criteria)` examples kept outside `tests/evals/` so `loadCorpus` only scans test suites).
  Require `eval:live:judge --calibrate` to achieve at least `85%` overall verdict agreement and `0` false-passes on `critical` safety criteria whenever the judge prompt, schema, harness, or model changes.
- **Drift metadata**: Record `judge_harness`, `judge_version`, `judge_model_id`, `rubric_sha256`, and `judge_prompt_sha256` in `judge-summary.json` so longitudinal comparisons detect judge changes independently of `skill_source_sha256`.
- **Evidence grounding and anti-verbosity rules**: Require verbatim `evidence_quotes` from the trace for each criterion and instruct the judge prompt to reward accuracy and safety equally for terse and detailed answers.
- **Quota control**: Keep judging off by default on `eval:live`, recommend `--only-passed` during routine sweeps, enforce sequential `concurrency=1`, and abort early on `AUTH_OR_RATE_LIMIT_RE`.

--------------------------------------------------------------------------------

## 2. Multi-turn chatting user simulator

### Simulator workflow

Single-turn tests cannot verify whether a skill asks an appropriate clarifying question, recovers after a `chezmoi` shim error, or adapts when a user adds constraints mid-conversation.

1. Turn 1 sends the deterministic `testCase.input.user_prompt` to the evaluated agent in an isolated `work/` directory with `.agents/skills/` and the `PATH`-shimmed `chezmoi` binary.
2. After each evaluated-agent turn, the orchestrator checks hard stop conditions (auth/rate-limit error, timeout, non-zero exit, `trace_violations`, `cap_exceeded`, `max_turns`, or repeated identical assistant reply).
3. If the loop continues, the orchestrator calls the user-simulator agent inside a separate empty `sim/` workspace with no `.agents/skills/` directory and no `chezmoi` shim.
4. The simulator receives `simulation.persona`, `simulation.goal`, `simulation.scenario_facts`, the turn counter (`current_turn` / `max_turns`), and the compact message history, then returns a structured `SimulatorTurnSchema` JSON object.
5. If `status === "continue"` and `message.trim()` is non-empty, the orchestrator resumes the evaluated agent session with that message and repeats up to `max_turns`.

### Simulator CLI flags

Add a `simulate` subcommand to `scripts/evals/cli.ts` (aliased as `eval:live:simulate`).
Keep `scripts/evals/cli.ts run` (`eval:live`) single-turn by default so accidental full-corpus runs do not multiply token usage; require `--include-multi-turn` on `run` to execute `simulation` cases there.

| Flag | Default | Purpose |
| --- | --- | --- |
| `--harness <name>` | `"codex"` | Harness under test (`codex` or `agy`) |
| `--sim-harness <name>` | Matches `--harness` | Harness driving the user simulator (`codex` or `agy`) |
| `--sim-model <model>` | Harness default | Optional model override for the simulator |
| `--skill <skill>` | None | Filter simulation cases by `target_skill` |
| `--case <id>` | None | Filter simulation cases by case ID |
| `--max-turns <n>` | Case `simulation.max_turns` (`4`) | Override maximum turns (clamped to `2..8`) |
| `--timeout <ms>` | `90000` | Per-turn timeout for the evaluated agent (`45000`ms fixed cap for simulator) |
| `--case-timeout <ms>` | `300000` | Total wall-clock cap across all turns of a case |
| `--judge` | `false` | Run post-hoc judge automatically after simulation completes |
| `--dry-run` | `false` | List matched simulation cases and turn budgets without model calls |
| `--keep-workdir` | `false` | Retain temporary workspaces and per-case session directories |

### Multi-turn session isolation for `codex` and `agy`

- **Per-case auth home**: Multi-turn cases require stateful session storage across turns of the same case, so each case gets its own `cases/<id>/codex_home/` or `cases/<id>/agy_home/` copying only `auth.json` or `antigravity-oauth-token`.
  This keeps session files out of host `~/.codex` and `~/.gemini` and prevents cross-case leakage.
- **Codex turn loop**:
  - Turn 1 runs `codex exec --json -C <workDir> -s workspace-write --ignore-user-config --ignore-rules --skip-git-repo-check "<user_prompt>"` (omitting `--ephemeral` so session state saves inside `cases/<id>/codex_home`) and captures `thread_id` from the `thread.started` JSONL event.
  - Turn `k >= 2` runs `codex exec resume --json --ignore-user-config --ignore-rules --skip-git-repo-check <thread_id> -` with `cwd: workDir` and the simulator's `message` on stdin.
- **AGY turn loop**:
  - Turn 1 runs `agy --output-format stream-json --dangerously-skip-permissions --print=<user_prompt>` inside isolated `HOME=cases/<id>/agy_home` and captures the session/conversation identifier from `stream-json` events (or uses `--continue` inside that single-case `agy_home`, verified in an implementation smoke check).
  - Turn `k >= 2` resumes with `--conversation <id>` (or `--continue`).
  - If `agy` session resumption fails under isolated `HOME`, fall back to a bounded transcript-replay prompt carrying prior `(user, assistant)` turns explicitly.

### Simulator schema and trace aggregation

```ts
export const SimulatorTurnSchema = z.object({
  status: z.enum(["continue", "goal_reached", "stuck"]),
  message: z.string(),
  reason: z.string().min(1),
});
```

For each simulated case, the runner appends every turn's JSONL stream into `eval_results/runs/<timestamp>/cases/<id>/<harness>-events.jsonl`, writes a human-readable `transcript.json` (`turns[]`, `stop_reason`, `total_duration_ms`, per-turn `usage`), and merges `discovered_skills`, `references_read`, `commands_invoked`, `trace_violations`, and `mock_calls` into a single `NormalizedTrace` (`final_response` equals the last assistant reply).
Both `evaluateTrace` and optional `judge` grading operate directly on that combined `NormalizedTrace` and `transcript.json`.

### Bounded turns and stop conditions

Check stop conditions in strict priority order after each evaluated-agent turn:

1. **Auth or rate-limit hit** (`AUTH_OR_RATE_LIMIT_RE` in evaluated agent or simulator): Stop case and abort the suite early with partial `summary.json`.
2. **Execution failure**: Evaluated-agent timeout (`--timeout`), case wall-clock timeout (`--case-timeout`), or non-zero exit code stops the case as failed.
3. **Isolation or shim violation**: Any `trace_violations` entry or `cap_exceeded` in the shared per-case `meta/shim.jsonl` (`simulation.shim_call_cap`, default `25`, max `40`) stops the case immediately as failed.
4. **Turn ceiling reached**: `current_turn >= effectiveMaxTurns` (`<= 8`) ends the conversation with `stop_reason: "max_turns_reached"`.
5. **Simulator termination**: `status === "goal_reached"` ends cleanly (`stop_reason: "goal_reached"`); `status === "stuck"` or an empty `continue` message ends with `stop_reason: "simulator_stuck"`.
6. **Stall guard**: If the normalized `final_response` matches the immediately preceding assistant turn verbatim, stop with `stop_reason: "stalled"`.

--------------------------------------------------------------------------------

## 3. Synthetic edge-case generator

### Generator workflow

The generator drafts `TestCaseSchema`-compatible candidates targeting sparse coverage areas without copying existing tests or leaking host secrets.

1. Read target `skills/<skill>/SKILL.md`, its `references/*.md` files, and existing case IDs, `eval_type` distributions, and `user_prompt` strings from `tests/evals/*.json`.
2. Build a bounded prompt requesting `--count` candidate cases for the selected `--focus` gap (`routing_ambiguity`, `flag_edge_case`, `safety_refusal`, `multi_turn`, or `reference_coverage`), instructing the model to set `origin: "synthetic"` and IDs `TC-<SKILL_CODE>-SYN-<NNN>` starting above existing suffixes.
3. Run `codex` or `agy` via `invokeStructuredHarness` in an empty read-only `0700` workspace (`--disable-slash-commands` on `agy`) using `SyntheticCandidateBatchSchema`.
4. Pass every returned `test_case` through the four-stage automated validation pipeline, drop rejected candidates with diagnostic reasons, strip the wrapper `rationale` into a sibling review report or comment log, and write accepted `TestCase[]` arrays to a gitignored staging file.

### Generator CLI flags

Add a `generate` subcommand to `scripts/evals/cli.ts` (aliased as `eval:live:generate`).

| Flag | Default | Purpose |
| --- | --- | --- |
| `--harness <name>` | `"codex"` | Local harness generating candidates (`codex` or `agy`) |
| `--model <model>` | Harness default | Optional model override |
| `--skill <skill>` | Required unless `--all-skills` | Target skill name under `skills/` |
| `--all-skills` | `false` | Generate across every skill sequentially (`--count` applied per skill) |
| `--focus <type>` | `"flag_edge_case"` | One of `routing_ambiguity`, `flag_edge_case`, `safety_refusal`, `multi_turn`, `reference_coverage` |
| `--count <n>` | `5` | Candidate cases to request per skill (hard cap `20`) |
| `--out-dir <dir>` | `eval_results/generated/<timestamp>-<skill>` | Staging directory inside gitignored artifacts (must not target `tests/evals/`) |
| `--evals-dir <dir>` | `"tests/evals"` | Existing corpus directory scanned for deduplication and ID allocation |
| `--skills-dir <dir>` | `"skills"` | Skills directory read for ground-truth commands and references |
| `--timeout <ms>` | `90000` | Generator invocation timeout in milliseconds |
| `--dry-run` | `false` | Print planned skills, existing case counts, and output path without model calls |

### Candidate schema

```ts
export const SyntheticCandidateSchema = z.object({
  rationale: z.string().min(1),
  test_case: TestCaseSchema,
});

export const SyntheticCandidateBatchSchema = z.object({
  candidates: z.array(SyntheticCandidateSchema).min(1).max(20),
});
```

After generation, enforce `test_case.origin = "synthetic"`, verify `test_case.target_skill` matches a valid skill directory, write pure `TestCase[]` JSON to `<out-dir>/cases.json`, and write the accepted/rejected summary with rationales to stdout and `<out-dir>/report.md`.

### Automated validation and human review gate

Every generated candidate must pass four offline gates before reaching the staging file, followed by explicit maintainer review before entering `tests/evals/`:

1. **Schema gate (`validate:evals` equivalent)**: `TestCaseSchema.safeParse(candidate)` rejects malformed fields, invalid `mock_responses` regular expressions, or empty rubrics.
2. **Sanitization and security-lint gate (`security-lint.ts` equivalent)**: Run `sanitizeTranscriptText` (`scripts/evals/extract-transcript-evals.ts`) across string fields (`user_prompt`, `mock_responses`, `expected`, `simulation`) and verify `lintSecurityContent` (`scripts/skills/validate/security-lint.ts`) produces zero findings (`hardcoded-*-key`, `pipe-to-shell`, `destructive-rm-root`, `unsafe-shell-eval`, `world-writable-chmod`, raw home paths, or emails).
3. **Deduplication gate**: Reject candidates whose `id` matches any existing case in `tests/evals/` or whose normalized `user_prompt` has exact equality or token-overlap similarity `>= 0.85` against existing prompts for that skill.
4. **Static contract gate (`validate:contracts` equivalent)**: Reuse `evaluateTestCase` logic from `scripts/evals/test-contracts.ts` so every staged candidate already satisfies `target_skill_exists`, `trigger_fixture_scope`, `selection_prompt_source_overlap`, `command_target_skill_coverage`, `answer_quality_expectation_present`, and `context_file_exists`.
5. **Human promotion gate**: Staged outputs stay under gitignored `eval_results/generated/` (rejecting any `--out-dir` inside `tests/evals/`).
   Maintainers inspect `<out-dir>/report.md` and `<out-dir>/cases.json`, optionally run `bun run eval:live --evals-dir <out-dir> --case <id>`, copy approved entries into `tests/evals/<skill>_eval.json`, and run `mise run validate && mise run validate:evals && mise run validate:contracts` before committing.

--------------------------------------------------------------------------------

## Implementation slices

Implement T3 incrementally across small, testable pull requests:

1. **Shared corpus and runner foundations**: Add `origin: "synthetic"`, `RubricSchema`, and `SimulationConfigSchema` to `scripts/evals/corpus.ts`; accept `"synthetic"` in `--origin` filtering in `scripts/evals/cli.ts` and `scripts/evals/test-contracts.ts`; extract `prepareIsolatedHarnessAuth`, `invokeStructuredHarness`, and configurable `CHEZMOI_SHIM_CALL_CAP` in `scripts/evals/runner.ts`; export `evaluateTestCase` and `loadSkillSources` in `scripts/evals/test-contracts.ts`.
2. **Post-hoc judge (`scripts/evals/judge.ts` + `cli.ts judge`)**: Implement `JudgeVerdictSchema`, `judge-summary.json` emission, `--calibrate` support, and initial `tests/fixtures/judge_calibration.json` fixtures with unit tests mocking `codex` and `agy` JSON outputs.
3. **Synthetic generator (`scripts/evals/generator.ts` + `cli.ts generate`)**: Implement staged generation into `eval_results/generated/` wired directly to `TestCaseSchema`, `sanitizeTranscriptText`, `lintSecurityContent`, deduplication, and `evaluateTestCase`.
4. **Multi-turn simulator (`scripts/evals/simulator.ts` + `cli.ts simulate`)**: Implement per-case `codex_home` / `agy_home` session resumption, simulator loop with stop conditions, `transcript.json` emission, and `NormalizedTrace` aggregation.
5. **Scripts and documentation**: Add `eval:live:judge`, `eval:live:simulate`, and `eval:live:generate` to `package.json` and `mise.toml` and update `docs/live-benchmark.md`.

--------------------------------------------------------------------------------

## Alternatives considered

### Post-hoc judge vs. inline-only grading during `eval:live run`

- **Inline-only**: Couples evaluated-agent latency and rubric grading into one run, forcing full re-runs whenever a rubric criterion changes.
- **Post-hoc primary (with optional `--judge` hook)**: Grades existing `eval_results/runs/<timestamp>/` artifacts independently, supports cross-harness judging (`codex` vs `agy`), and skips already-failed T2 cases via `--only-passed`.

### Native session resume vs. stateless multi-turn transcript replay

- **Stateless replay**: Prepends growing `(user, assistant)` transcripts into every prompt, multiplying input tokens quadratically and bypassing real harness multi-turn memory.
- **Native session resume (`codex exec resume` / `agy --conversation`)**: Uses isolated per-case auth directories to preserve linear context while keeping explicit transcript replay only as a documented `agy` fallback.

### Gitignored staging (`eval_results/generated/`) vs. writing directly to `tests/evals/`

- **Direct writes**: Risks polluting the checked-in corpus with noisy or low-signal synthetic prompts if a run aborts or passes superficial checks.
- **Gitignored staging plus four automated gates**: Keeps `tests/evals/` clean and forces explicit maintainer selection via `git diff` and `mise run validate:contracts`.
