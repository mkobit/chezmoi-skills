# Evaluation strategy and local harness runner

The checked-in JSON files under `tests/evals/` are the evaluation corpus source of truth.

Raw harness transcripts, shim logs, and run summaries under `eval_results/` are gitignored, disposable local artifacts.

## Evaluation lanes

This project keeps continuous integration credential-free and runs live agent evaluations on demand through local coding harnesses.

| Lane | Cadence | Measurement | Status |
| --- | --- | --- | --- |
| Static CI validation | Every pull request | Markdown, spelling, formatting, typecheck, skill manifests, corpus schema (`validate:evals`), contract checks (`validate:contracts`), and unit tests (`bun test`) | Active in GitHub Actions |
| Local harness smoke run | On demand after skill or corpus edits | Skill discovery, reference reads, mocked `chezmoi` command invocations, and answer quality via `codex` or `agy` | Active via `bun run eval:live --smoke` |
| Targeted or full local harness run | Before major releases or targeted skill refactors | Filtered or full corpus execution against `codex` or `agy` with baseline comparison | Active via `bun run eval:live` |

Do not automate personal `codex` or `agy` allowances in scheduled jobs, background daemons, or CI workflows.

## Running local harness evaluations

Run evaluations inside an isolated sandbox such as `.sbx/` ([sbxenv.yaml](../.sbx/sbxenv.yaml)) when possible.

The runner isolates each case in a temporary `/tmp/chezmoi-evals-<run_id>/cases/<case_id>/` workspace with `skills/` copied to `.agents/skills/`, overridden `HOME`/`XDG_*`/`CHEZMOI_*` environment variables, and a `PATH`-shimmed `chezmoi` binary.

```sh
# Preview matched cases without invoking a harness
bun run eval:live --smoke --dry-run

# Run smoke cases with codex (default) or agy
bun run eval:live --smoke
bun run eval:live --harness agy --smoke

# Filter by skill or case ID
bun run eval:live --skill chezmoi-templating
bun run eval:live --case TC-CLI-CMD-001

# Compare against a prior summary.json
bun run eval:live --smoke --baseline eval_results/runs/<timestamp>/summary.json
```

Each run writes `summary.json` (`schema_version: "1"`) and per-case logs under `eval_results/runs/<timestamp>/`.

## Baseline comparisons and drift warnings

Passing `--baseline <summary.json>` compares the current run against a prior `summary.json` and reports:

* `new_failures`: Cases that failed in the current run after passing in the baseline (or newly added failing cases).
* `new_passes`: Cases that passed in the current run after failing in the baseline.
* `unchanged_failures`: Cases that failed in both the baseline and the current run.

The runner warns when `corpus_sha256`, `harness_name`, or `harness_version` differs between the current run and the baseline.

## Corpus and failure review

Review every failed assertion using the per-case `codex-events.jsonl` or `agy-events.jsonl`, `shim.jsonl`, and `summary.json` artifacts.

Classify each failure as a corpus defect, assertion defect, skill defect, harness behavior change, or infrastructure error before editing expectations.

Do not weaken corpus assertions merely to make an observed output pass; update expectations only when equivalent valid syntax (such as `--exclude=scripts` vs. `--exclude scripts`) or skill guidance justifies it.
