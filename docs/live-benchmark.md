# Live benchmark review

The checked-in JSON files under `tests/evals/` are the evaluation corpus source of truth.

Generated Promptfoo inputs and provider outputs under `eval_results/` are disposable artifacts.

Promptfoo `0.123.1` is pinned intentionally, and changing it requires a new baseline identity.

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
