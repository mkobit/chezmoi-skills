# TypeScript skill evaluation tools spike

- **Author**: Mike Kobit
- **Status**: Proposed
- **Date**: 2026-11-23
- **Bead**: `cz-skl-84i`

--------------------------------------------------------------------------------

## Decision

Keep and incrementally extend the PR #124 Bun runner in `scripts/evals/` as the single orchestrator for the T1–T3 evaluation loop.
Do not adopt `skillgrade`, `agent-skills-eval`, `skillEd`, `@vercel/agent-eval`, or `@effectorhq/skill-eval`.

None of the evaluated open-source TypeScript tools support both local OAuth execution (`codex` and `agy`) without API keys, non-Docker `HOME`/`XDG_*`/`CHEZMOI_*` isolation with a `chezmoi` `PATH` shim, progressive `references/*.md` read verification, and OAuth-backed T3 workflows without custom adapter sprawl or an incompatible runtime stack.
Extending the existing 2,661-line Bun suite preserves one corpus format (`tests/evals/*.json`), one runtime (`bun` 1.4.4), zero Docker dependencies, and full coverage of all T1–T3 requirements.

## Evaluation criteria

This spike evaluated candidate tools against the requirements defined in epic `cz-skl-bkx` and bead `cz-skl-84i`:

- **Local OAuth (`codex` and `agy`)**: Execute both `codex` and `agy` using existing local OAuth credentials with zero paid API keys.
- **No-Docker isolation and `chezmoi` shim**: Isolate `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `CHEZMOI_CONFIG_FILE`, and `CHEZMOI_SOURCE_DIR` in temporary workspaces without Docker, while injecting a per-case `PATH`-shimmed `chezmoi` binary with mock rules, call caps, and forbidden-path checks.
- **Progressive `references/*.md` verification**: Verify from harness traces that an agent discovers `SKILL.md` and lazily reads `references/*.md` files rather than receiving all references upfront in the system prompt.
- **T1–T3 extensibility without tool sprawl**: Support offline T1 lint/contract checks, T2 session backtesting (`extract-transcript-evals.ts`), T3 LLM-as-a-judge, multi-turn user simulation, synthetic edge-case generation, and checked-in longitudinal commit history.
- **Maintenance cost**: Align with the repository's pinned Bun runtime, `tests/evals/*.json` corpus (111 cases), and low dependency footprint.

## Candidate comparison

| Tool | Local OAuth (`codex` + `agy`) | No-Docker `HOME` / shim isolation | Progressive `references/*.md` check | T3 via OAuth (judge / sim / gen) | Longitudinal history | Runtime and footprint |
| --- | --- | --- | --- | --- | --- | --- |
| PR #124 Bun runner | Yes (`codex` + `agy`) | Yes (per-case `HOME` + `chezmoi` shim) | Yes (`discovered_skills` + `references_read`) | Extensible via existing adapters | Planned `history.jsonl` (`cz-skl-df6`) | Bun 1.4.4; 2,661 LOC + 1,083 test LOC |
| `mgechev/skillgrade` (`v0.5.0`) | No (`*_API_KEY` scraping; no `agy` trace) | No in `--provider=local` (host `env`) | Partial (`SKILL.md` only; no refs) | No (API keys required for `LLMGrader` / `init`) | Local `$TMPDIR` JSON only | Node `>=20`; `dockerode`, ACP SDK, YAML |
| `darkrishabh/agent-skills-eval` (`v0.1.1`) | No (HTTP API only in stable CLI) | No (`experimental/runtime` has no adapters) | Broken (injects all refs in system prompt) | No (API key judge; no sim or generator) | Local `iteration-N` HTML/JSON only | Node `>=18`; `commander`, `js-yaml` |
| `DeadHead04/skillEd` (`v0.3.0`) | Partial (`codex` host login; no `agy`) | No in `none` mode (inherits host `process.env`) | Partial (`codex` tool calls; custom `agy` needed) | Partial (`AgentJudge` yes; `UserSimulator` API-only) | `compare` diff only; no ledger | Node `24.21+`; GitHub release only; heavy deps |
| `@vercel/agent-eval` | No (`AI_GATEWAY_API_KEY` / `OPENAI_API_KEY`) | No (`docker` or `vercel` sandbox only) | Partial (raw transcript o11y) | Partial (judge via API; no sim or generator) | Fingerprinted run cache only | Node `>=22`; Docker/Vercel + Vitest fixtures |

### PR #124 Bun runner (baseline)

The checked-in runner in `scripts/evals/` already satisfies the hardest T2 isolation and harness constraints:

- **OAuth isolation**: `scripts/evals/runner.ts` copies only `auth.json` into a per-run `0700` `CODEX_HOME` (passing `--ignore-user-config` and `--ignore-rules` to `codex exec`) and copies only `antigravity-oauth-token` into a per-run `0700` `HOME` for `agy`.
- **Workspace and `chezmoi` shim**: Each case runs in an isolated workspace with overridden `HOME`, `XDG_*`, and `CHEZMOI_*` variables, a `PATH`-shimmed `chezmoi` binary enforcing `mock_responses` and a 25-call cap, and `trace_violations` checks blocking reads of `meta/` or `tests/evals/`.
- **Trace assertions**: `parseCodexTrace` and `parseAgyTrace` populate `discovered_skills`, `references_read`, and `commands_invoked`, evaluated deterministically in `scripts/evals/corpus.ts`.
- **Current gaps**: Command naming clarity (`cz-skl-2w7`), T1 overlap/security lint (`cz-skl-vjr`), distilled transcript backtesting wiring (`cz-skl-ine`), T3 judge/simulator/generator modules (`cz-skl-dlr`), and checked-in aggregate history (`cz-skl-df6`).

### `mgechev/skillgrade` (`v0.5.0`)

`skillgrade` provides a clean `eval.yaml` harness with `deterministic`, `llm_rubric`, and `human` graders, scripted `turns`, and an optional `--provider=local` mode, but fails core repository requirements:

- **API-key-oriented Codex and missing `agy` traces**: `CodexAgent` (`src/agents/codex.ts`) reads `~/.codex/auth.json` only to extract `*_API_KEY` environment variables, omits `CODEX_HOME` isolation, and skips `--ignore-user-config` and `--ignore-rules`.
  No `agy` adapter exists, and `CommandAgent` (`src/agents/command.ts`) returns a flat `stdout + stderr` string without structured tool or skill traces.
- **No non-Docker isolation**: `LocalProvider` (`src/providers/local.ts`) copies files into `/tmp/skillgrade-*` and spawns child processes with `{ ...process.env, ...env }`, leaving host `HOME`, `XDG_*`, and `CHEZMOI_*` active without Docker.
- **Missing progressive disclosure checks**: `parseCodexJsonOutput` records only `SKILL.md` directory names and `command_execution` presence, not `references/*.md` reads, and `DeterministicGrader` does not pass `_sessionLog` to grader scripts.
- **API-key-bound T3 features**: `LLMGrader` (`src/graders/index.ts`) and AI task generation in `skillgrade init` require `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`.
  Scripted `turns` are supported, while autonomous user simulation, cross-commit history tracking, and T1 repo lint are absent.

### `darkrishabh/agent-skills-eval` (`v0.1.1`)

`agent-skills-eval` targets `agentskills.io` prompt evaluation (`with_skill` vs. `without_skill`) via an OpenAI-compatible HTTP client and cannot test real CLI harness behavior:

- **No CLI harness execution**: Stable CLI and SDK runs call `OPENAI_BASE_URL` with `OPENAI_API_KEY` (`src/openai-compatible-provider.ts`) and never invoke `codex` or `agy`.
  Its `experimental/runtime` subpath (`src/agent-runtime.ts`) defines staging interfaces only, is not wired into the CLI or `evaluateSkills`, and ships zero harness adapters.
- **Incompatible with progressive disclosure**: `renderSkillSystemMessage` (`src/run-eval.ts`) concatenates `SKILL.md` plus every `references/*` and `scripts/*` file into the initial system message, preventing verification of lazy `references/*.md` reads.
- **Incomplete T3 loop**: Judging requires an OpenAI-compatible API key, and multi-turn simulation, synthetic generation, session backtesting, and cross-commit history tracking do not exist.

### `DeadHead04/skillEd` (`v0.3.0`)

`skillEd` is the closest open-source contender in feature breadth (supporting native host `codex` login, multi-turn `runTurn`, `RuleBasedJudge`, `AgentJudge`, and `compare`), yet fails on runtime fit, isolation, and OAuth parity:

- **Runtime mismatch and heavy footprint**: `skillEd` is not published on npm (distributed via GitHub Releases tarballs or source builds), targets Node `>=24.21.0 <25` instead of Bun `1.4.4`, and bundles OpenTelemetry GRPC/HTTP exporters, `@alibaba-group/opensandbox`, `@anthropic-ai/sdk`, `openai`, `ajv`, and `re2-wasm`.
- **Native isolation and `agy` gaps**: `NoneRuntime` (`src/runtime/none.ts`) spawns processes with `mergedEnv` (`process.env`), does not isolate `HOME`, `XDG_*`, or `CHEZMOI_*`, omits `--ignore-user-config` and `--ignore-rules` on `codex exec`, and rejects `codex_auth_file` outside `DockerRuntime`.
  `assertBenchmarkIsolation` (`src/evaluator/benchmark-isolation.ts`) also rejects `with_skill` vs. `without_skill` comparisons unless Docker is enabled.
  Integrating `agy` requires maintaining a custom `engine.custom` (`transport: local`) wrapper to translate `SessionInput`/`SessionResult` and `agy` `stream-json` events into `skillEd` `Transcript` messages.
- **API-key dependency in T3 user simulator**: Although `AgentJudge` can invoke a native `Agent`, `UserSimulator` (`src/usersimulator/index.ts`) hardcodes `openai` and `@anthropic-ai/sdk` clients and throws an error without an API key.
  Synthetic case generation, transcript distillation, and a checked-in longitudinal commit ledger are also absent.

### Other tools screened

- **`@vercel/agent-eval`**: Requires Docker or Vercel Sandbox (`SandboxBackend = 'vercel' | 'docker'`) and `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`, with no `agy` support or non-Docker local execution.
- **`@effectorhq/skill-eval`**: Performs static `SKILL.md` scoring (`src/static-analyzer.js`) only and provides no execution harness or T2/T3 capabilities.
- **Promptfoo**: Previously evaluated and retired in PR #124 ([harness-driven-local-eval-runner.md](harness-driven-local-eval-runner.md)) due to paid API requirements and single-turn `exec` wrapper overhead.

## Recommended path for T1–T3

Keep `tests/evals/*.json` as the single source of truth and close each remaining epic item inside `scripts/` using the existing Bun toolchain:

1. **T1 offline separation and lint (`cz-skl-2w7`, `cz-skl-vjr`)**: Rename scripts in `package.json` and `mise.toml` so offline checks are distinct from model-calling `codex`/`agy` commands, and add zero-model checks for cross-skill `SKILL.md` overlap and unsafe shell/secret patterns.
2. **T2 session backtesting (`cz-skl-ine`)**: Update `scripts/evals/extract-transcript-evals.ts` to reuse `TestCaseSchema` from `scripts/evals/corpus.ts` (`origin: "distilled"`) so real session cases execute through the existing isolated `eval:local` runner.
3. **T3 evaluators (`cz-skl-dlr`)**: Build thin Bun modules on top of the isolated `codex` and `agy` harness adapters for post-hoc LLM-as-a-judge rubric grading, multi-turn user simulation (pairing a simulator turn prompt with `codex exec resume` or bounded conversation replay), and synthetic candidate case generation for maintainer review.
4. **Longitudinal history tracking (`cz-skl-df6`)**: Emit compact aggregate records (commit SHA, `skill_source_sha256`, `corpus_sha256`, pass/fail counts, token usage, and latency) to a checked-in `history.jsonl` ledger while keeping raw harness transcripts and `shim.jsonl` gitignored under `eval_results/`.
