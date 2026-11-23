# Longitudinal eval history tracking

- **Author**: Mike Kobit
- **Status**: Proposed
- **Date**: 2026-11-23
- **Bead**: `cz-skl-df6`

--------------------------------------------------------------------------------

## Overview

This design defines a checked-in, append-only evaluation ledger at `tests/evals/history.jsonl` for tracking skill evaluation outcomes, token usage, and latency across commits.
Raw harness transcripts, stderr logs, `shim.jsonl`, and full `summary.json` files remain local, gitignored, and disposable under `eval_results/`.
Recording is strictly opt-in via `--record-history` on `eval:live` and requires no CI model calls or external storage.

## Goals

- **Compact longitudinal ledger**: Record commit SHA, dirty state, harness and model identity, content hashes, pass/fail/skipped counts, token and latency aggregates, and optional T3 judge totals in one JSON line per run.
- **Disposable raw artifacts**: Keep `eval_results/` 100% gitignored and safe to delete without touching checked-in history.
- **Opt-in recording**: Leave `tests/evals/history.jsonl` untouched during routine local runs unless `--record-history` is passed.
- **Duplicate and conflict safety**: Deduplicate repeated runs by deterministic run identity and avoid git merge conflicts with append-only writes plus `merge=union`.
- **Offline validation**: Verify `tests/evals/history.jsonl` schema and uniqueness in `validate:evals` without invoking `codex` or `agy`.

## Non-goals

- Storing per-case results, `failed_case_ids`, prompts, or model replies in git.
- Recording ad-hoc `--skill`, `--case`, `--origin`, `--dry-run`, or early-aborted runs in `tests/evals/history.jsonl`.
- Building a web dashboard, HTML report generator, or automated CI regression gate.
- Estimating dollar cost in `history.jsonl` (local OAuth runs have no per-token billing and pricing changes independently of token counts).

## Ledger location and artifact boundary

Store checked-in aggregate history in `tests/evals/history.jsonl` and keep everything under `eval_results/` local and disposable.

```text
tests/evals/
├── *_eval.json        # Checked-in corpus cases (hashed into corpus_sha256)
└── history.jsonl      # Checked-in append-only aggregate ledger (created on first record)

eval_results/          # Gitignored disposable local runs (safe to rm -rf anytime)
└── runs/<timestamp>/
    ├── summary.json
    ├── judge-summary.json
    └── cases/<id>/
```

`tests/evals/history.jsonl` is cleaner than `eval_results/history.jsonl` for three reasons:

- **Zero `.gitignore` exceptions**: `.gitignore` ignores the entire `eval_results` directory, so `rm -rf eval_results` never deletes tracked history and `.gitignore` needs no `!eval_results/history.jsonl` negation rules.
- **Zero hash or validator interference**: `loadCorpus` (`scripts/evals/corpus.ts`), `validateContractCoverage` (`scripts/skills/validate/coverage.ts`), `validateSecurityLint` (`scripts/skills/validate/security-lint.ts`), and `loadTestCases` (`scripts/evals/test-contracts.ts`) filter strictly by `.json`, so `.jsonl` updates never alter `corpus_sha256` or static contract checks.
- **Preserved isolation**: Evaluated agents execute inside `/tmp/chezmoi-evals-<run_id>/cases/<id>/work/` and `trace_violations` already blocks any access referencing `tests/evals/`.

## Record schema

Define `HistoryRecordSchema` in a dedicated `scripts/evals/history.ts` module using Zod v4 (`zod@4.6.7`).

```ts
import { z } from "zod";

export const TokenUsageAggregateSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  cached_input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cases_with_usage: z.number().int().nonnegative(),
});

export const LatencyAggregateSchema = z.object({
  total_ms: z.number().int().nonnegative(),
  mean_ms: z.number().int().nonnegative(),
  p95_ms: z.number().int().nonnegative(),
});

export const JudgeHistorySummarySchema = z.object({
  judge_harness: z.enum(["codex", "agy"]),
  judge_version: z.string().min(1),
  judge_model_id: z.string().min(1).nullable(),
  rubric_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  judge_prompt_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  total_judged: z.number().int().nonnegative(),
  passed_judged: z.number().int().nonnegative(),
  failed_judged: z.number().int().nonnegative(),
  error_judged: z.number().int().nonnegative(),
});

export const HistoryRecordSchema = z
  .object({
    schema_version: z.literal("1"),
    record_id: z.string().regex(/^[0-9a-f]{64}$/),
    timestamp: z.iso.datetime(),
    commit_sha: z.string().regex(/^[0-9a-f]{7,40}$/),
    git_dirty: z.boolean(),
    harness_name: z.enum(["codex", "agy"]),
    harness_version: z.string().min(1),
    model_id: z.string().min(1).nullable(),
    skill_source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    corpus_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    run_scope: z.enum(["full", "smoke"]),
    total_cases: z.number().int().nonnegative(),
    passed_cases: z.number().int().nonnegative(),
    failed_cases: z.number().int().nonnegative(),
    skipped_cases: z.number().int().nonnegative(),
    tokens: TokenUsageAggregateSchema,
    latency_ms: LatencyAggregateSchema,
    judge: JudgeHistorySummarySchema.optional(),
  })
  .refine(
    (record) =>
      record.total_cases ===
      record.passed_cases + record.failed_cases + record.skipped_cases,
    "total_cases must equal passed_cases + failed_cases + skipped_cases.",
  );

export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;
```

### Field semantics and aggregation rules

- **Git identity (`commit_sha`, `git_dirty`)**: Copied from `RunSummary`, which calls `getGitMetadata()` before writing `history.jsonl` so the ledger write itself never flips `git_dirty`.
- **Content hashes (`skill_source_sha256`, `corpus_sha256`)**: Reused directly from `buildRunSummary` (`corpusHash` over `skills/` and `tests/evals/*.json`) so skill or corpus edits are visible even when `git_dirty` is `true`.
- **Case counts (`total_cases`, `passed_cases`, `failed_cases`, `skipped_cases`)**: `total_cases` equals the full corpus size loaded from `tests/evals/*.json`, and `skipped_cases` equals `total_cases - (passed_cases + failed_cases)`.
  In `--smoke` runs or single-turn runs that skip multi-turn `simulation` cases, `skipped_cases` captures unexecuted corpus cases while `RunSummary.total_cases` continues to count executed cases.
- **Token aggregates (`tokens`)**: Sum `input_tokens`, `cached_input_tokens` (default `0` when omitted), and `output_tokens` across every `CaseResult.usage` object containing at least one finite non-negative integer field, and increment `cases_with_usage` once per reporting case.
  A `cases_with_usage` value of `0` distinguishes absent harness telemetry from zero-token usage.
- **Latency aggregates (`latency_ms`)**: `total_ms` is the rounded sum of `CaseResult.duration_ms`, `mean_ms` is `Math.round(total_ms / executed_cases)` (`0` if empty), and `p95_ms` is the nearest-rank 95th percentile (`sorted[Math.max(0, Math.ceil(0.95 * n) - 1)]`).
- **Optional T3 judge summary (`judge`)**: Omitted for T2-only runs, and populated from `judge-summary.json` ([t3-evaluators.md](t3-evaluators.md)) when `eval:live run --judge --record-history` or `eval:live judge --run <dir> --record-history` runs.

## CLI opt-in and recording rules

Add `--record-history` (default `false`) and `--history-file <path>` (default `"tests/evals/history.jsonl"`) to `scripts/evals/cli.ts` (`run`, and the planned `judge` subcommand).

```sh
# Run smoke suite and append one entry to tests/evals/history.jsonl
bun run eval:live --smoke --record-history

# Run full corpus with T3 judge and record combined T2 + T3 entry
bun run eval:live --judge --record-history

# Record a post-hoc T3 judge pass against an existing local run directory
bun run eval:live:judge --run eval_results/runs/<timestamp> --record-history
```

Apply four guardrails so only clean, comparable snapshots reach `tests/evals/history.jsonl`:

1. **Reject partial ad-hoc filters before execution**: Throw `ConfigError` (exit `2`) before invoking any model if `--record-history` is combined with `--skill`, `--case`, or `--origin`.
2. **Require git commit metadata**: Throw `ConfigError` (exit `2`) before execution if `git rev-parse HEAD` fails (`commit_sha === "unknown"`).
3. **No-op on `--dry-run` or `aborted_early`**: Skip writing `history.jsonl` when `--dry-run` is active or when `summary.aborted_early` is `true` (auth or rate-limit failure); partial artifacts remain in `eval_results/`.
4. **Warn on dirty trees, record failing suites**: Emit a stderr warning when `git_dirty` is `true` so maintainers remember to commit skill/corpus edits first, and still record completed runs where `failed_cases > 0` (preserving exit code `1`) so regressions appear in history.

To support post-hoc `judge --run <dir> --record-history` cleanly, add optional `run_scope?: "full" | "smoke" | "filtered"` and `skipped_cases?: number` fields to `RunSummary` (`scripts/evals/runner.ts`) and reject legacy `summary.json` files that lack `run_scope`.

## Deduplication and merge-conflict avoidance

### Deterministic `record_id` deduplication

Compute `record_id` as the `sha256` hex digest of canonical JSON over the run identity fields:

```ts
const identity = {
  commit_sha,
  git_dirty,
  harness_name,
  harness_version,
  model_id,
  skill_source_sha256,
  corpus_sha256,
  run_scope,
  judge: judge
    ? {
        judge_harness: judge.judge_harness,
        judge_version: judge.judge_version,
        judge_model_id: judge.judge_model_id,
        rubric_sha256: judge.rubric_sha256,
        judge_prompt_sha256: judge.judge_prompt_sha256,
      }
    : null,
};
```

Before appending, `appendHistoryRecord` scans existing `record_id` values in `tests/evals/history.jsonl`.
If `record_id` already exists, it leaves the file untouched and logs a notice (`Skipped duplicate history entry <12-char prefix>`).
Because `judge` identity is part of `identity`, recording a T2-only run and later recording a post-hoc judged run for the same commit do not collide, while repeating the identical run twice is idempotent.

### Append-only writes and `.gitattributes` `merge=union`

Each recorded run appends one single-line `JSON.stringify(record) + "\n"` entry at EOF without rewriting or re-sorting existing lines.
Add one rule to `.gitattributes` so concurrent pull requests appending to EOF merge cleanly in Git without conflict markers:

```text
tests/evals/history.jsonl merge=union
```

Because `merge=union` can interleave lines from concurrent branches out of timestamp order, any reader helper (`loadHistory`) sorts parsed records by `timestamp` ascending at read time.
Update `bun run validate:evals` (`scripts/evals/cli.ts validate`) so that whenever `tests/evals/history.jsonl` exists, it validates every non-empty line against `HistoryRecordSchema` and fails on malformed JSONL (such as unresolved conflict markers) or duplicate `record_id` entries.

## Implementation plan

Implement longitudinal history tracking in one small follow-up change touching only existing `scripts/evals/` entry points:

1. **`scripts/evals/history.ts` (Create)**: Define `HistoryRecordSchema`, `computeRecordId`, `aggregateTokenUsage`, `aggregateLatencyMs`, `buildHistoryRecord`, `appendHistoryRecord`, and `loadHistory`.
2. **`scripts/evals/runner.ts` (Modify)**: Add optional `run_scope` and `skipped_cases` to `RunSummary` and populate them in `buildRunSummary` / `runEvalSuite`.
3. **`scripts/evals/cli.ts` (Modify)**: Wire `--record-history` and `--history-file` into `run` (and `judge` once implemented), enforce preflight/abort guards, and validate `tests/evals/history.jsonl` in `validate` when present.
4. **`.gitattributes` (Create)**: Add `tests/evals/history.jsonl merge=union`.
5. **`tests/eval-history.test.ts` and `docs/live-benchmark.md` (Create / Modify)**: Test schema validation, token/latency aggregation, `record_id` deduplication, dirty/aborted/filter guards, and `validate` checks, and document `--record-history` in `docs/live-benchmark.md`.

## Alternatives considered

### `eval_results/history.jsonl` vs. `tests/evals/history.jsonl`

- **`eval_results/history.jsonl`**: Requires changing `.gitignore` from `eval_results` to `eval_results/*` with `!eval_results/history.jsonl` and breaks the rule in [live-benchmark.md](../live-benchmark.md) that everything under `eval_results/` is disposable.
- **`tests/evals/history.jsonl`**: Keeps `eval_results/` 100% disposable with zero `.gitignore` edits and zero impact on `.json` corpus hashing or contract checks.

### Per-run JSON files vs. single append-only `history.jsonl`

- **Per-run files (`tests/evals/history/<ts>-<sha>.json`)**: Avoid EOF merge conflicts natively, at the cost of accumulating many small tracked files across commits.
- **Single `tests/evals/history.jsonl` with `merge=union`**: Keeps one compact, line-oriented ledger easily queried with `jq` while solving concurrent EOF appends with a one-line `.gitattributes` rule.

### Always-on history recording vs. `--record-history` opt-in

- **Always-on recording**: Pollutes git status during iterative local debugging and creates spurious diffs on abandoned experiments.
- **Opt-in `--record-history`**: Keeps routine `eval:live` runs side-effect-free outside `eval_results/` and reserves checked-in history for intentional milestone and PR snapshots.
