# Evaluation strategy and live benchmark review

The checked-in JSON files under `tests/evals/` are the evaluation corpus source of truth.

Generated Promptfoo inputs and provider outputs under `eval_results/` are disposable artifacts.

Promptfoo `0.123.1` is pinned intentionally, and changing it requires a new baseline identity.

## Evaluation strategy

This project prioritizes durable, low-cost evidence over frequent model sampling.

Routine development and continuous integration must not make paid provider calls.

Track results through separate lanes because each lane measures a different part of the system.

| Lane | Cadence | Measurement | Status |
| --- | --- | --- | --- |
| Deterministic snapshot | Every pull request | Corpus coverage, generated-suite counts, hashes, static contracts, and skill token sizes | Checks are active; durable aggregate history is planned |
| OpenAI API smoke sample | Selected milestones or material evaluation changes | Routing and answer quality on a fixed 12–18 case subset, including API token usage and estimated cost | Planned; no OpenAI provider or smoke subset is configured |
| Codex host check | Occasional rotating sample covering all nine skills over multiple runs | Skill discovery, progressive reference loading, tool use, clarification, and grounded answers | Planned; this is not an ordinary Promptfoo provider result |
| Full cross-provider matrix | Exceptional explicit review | Broad provider and surface comparison against the complete corpus | Available through the manual workflow |

Do not combine these lanes into one score or treat any lane as a general compatibility guarantee.

An OpenAI API smoke result measures a direct model response under the configured Promptfoo surface.

A Codex host check measures the managed agent harness and must verify that the host discovers the correct skill, reads the necessary references, and uses tools appropriately.

OpenAI documents the managed Codex harness through the [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), where model, tool, and hosted sandbox usage have separate costs.

Do not automate a maintainer's personal ChatGPT or Codex allowance for repository benchmarks.

Any future OpenAI automation must use dedicated credentials, record actual API usage, and use a project [hard spend limit](https://developers.openai.com/api/docs/guides/spend-limits).

Keep the checked-in JSON corpus and Promptfoo harness rather than migrating this project to the OpenAI Evals API, which [OpenAI is deprecating](https://developers.openai.com/api/docs/guides/evals).

If a rare OpenAI-only full run becomes useful, evaluate the [Batch API](https://developers.openai.com/api/docs/guides/batch) for lower asynchronous inference cost before adding another synchronous path.

## Longitudinal result history

Preserve reviewed aggregates over time without retaining raw model conversations indefinitely.

An accepted aggregate should identify the commit, corpus, skill source, evaluator code, dependency lock, Promptfoo version, generated inputs, provider, model, suite, and prompt surface.

Record pass and failure counts, failed corpus IDs, request counts, input tokens, cached-input tokens, output tokens, latency, and estimated cost when the provider exposes them.

Store accepted aggregates through reviewed pull requests or another maintainer-approved durable history mechanism.

Do not claim that durable history already exists until its checked-in format and comparison tooling are implemented.

The existing `record:benchmark` and `generate:history` commands provide aggregation components, but no accepted history is currently checked in or published.

Keep raw prompts, skill context, model outputs, and Promptfoo databases private and disposable unless maintainers explicitly approve longer retention.

Use deterministic history for routine change tracking, sparse OpenAI samples for model trends, and Codex host checks for actual agent-host compatibility.

Use the full matrix only after major corpus, prompt, provider, model, or evaluator changes, or when a maintainer explicitly requests a comprehensive review.

## Next implementation phase

Define a stable checked-in schema and path for accepted deterministic and credentialed aggregates.

Generate a zero-token deterministic snapshot in continuous integration and compare it with prior accepted snapshots.

Tag a fixed 12–18 case smoke subset that balances adversarial routing, ambiguity, answer quality, command correctness, and safety.

Add an optional OpenAI API provider only to the smoke path, with separate authorization and spending controls.

Define a Codex host-check protocol that rotates through the nine skills and records host behavior separately from Promptfoo results.

Complete these changes without invoking credentialed providers, then authorize the first samples separately.

## Authorization boundary

The live workflow is manual-only and runs from `main`.

The `plan` job validates both Promptfoo configurations without credentials, writes `live-preflight.json`, reports the planned request count, and uploads the generated inputs for review.

The provider job runs only when `confirm_paid_run` is selected and the `live-benchmark` environment allows the job to proceed.

The boolean input records authorization to request a paid run, but it does not prove that a reviewer approved the generated plan.

Configure that environment with required reviewers and only the `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY` secrets.

Set provider-account spending limits separately because the repository reports the expected matrix size but cannot bound retries or enforce a reliable currency ceiling.

Do not authorize the provider job when the planned request count or hashes are unexpected.

The workflow does not schedule recurring calls or publish results.

Raw JSON and HTML results remain private workflow artifacts for 14 days because they contain prompts, skill context, and model output.

## First benchmark

Treat the first complete run as observational rather than a release gate.

Require a complete answer and router matrix with no provider, parsing, or infrastructure errors before reviewing model quality.

Record the commit, corpus hash, skill-source hash, evaluation-code hash, dependency-lock hash, Promptfoo version, generated-input hashes, provider identifiers, and planned request counts from `live-preflight.json`.

Review every failed assertion.

Also review a deterministic passing sample containing one selected-skill answer and one router result for each skill and provider.

Review every safety-tagged or destructive-action case, whether it passed or failed automatically.

Score each reviewed output on correctness, safety, grounding in the supplied skill context, and actionable usability.

Classify each failure as a corpus defect, assertion defect, skill defect, provider regression, provider limitation, or infrastructure error.

Reject the candidate baseline for any unsafe destructive guidance, fabricated command or flag presented as fact, incomplete matrix, or infrastructure error.

Store an accepted baseline only through a reviewed pull request after the raw artifact review is complete.

Do not change corpus expectations merely to make an observed output pass.

## Initial regression gates

Keep pull-request CI credential-free with unit tests, static contracts, and `bun run eval:validate`.

Compare live runs only when the commit-independent identity fields in `live-preflight.json` match the accepted baseline.

Require a new baseline when the corpus, skill source, evaluation code, dependency lock, Promptfoo version, generated inputs, prompt surfaces, providers, or model identifiers change.

Hard-fail a comparable run for an incomplete matrix, any new infrastructure error, any critical safety regression, or any newly fabricated command or flag in the reviewed critical set.

Treat one new failed result in a provider and suite surface as review-required while variance is unknown.

Treat more than one new failed result in a provider and suite surface as a provisional regression failure.

After at least three repeated runs of the same matrix, replace the provisional tolerance with per-provider and per-surface limits derived from observed variance.

Do not gate on the aggregate baseline-versus-skill delta because the selected-skill answer surface receives oracle-selected context and is not an end-to-end agent measurement.

Do not resume scheduled runs or public aggregate publication until maintainers explicitly approve their cost, retention, and disclosure policies.
