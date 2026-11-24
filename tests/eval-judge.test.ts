import { afterEach, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../scripts/evals/cli.ts";
import {
  type Rubric,
  RubricSchema,
  type TestCase,
} from "../scripts/evals/corpus.ts";
import { buildHistoryRecord } from "../scripts/evals/history.ts";
import {
  buildJudgePrompt,
  computeRubricSha256,
  JUDGE_PROMPT_SHA256,
  JudgeSummarySchema,
  JudgeVerdictSchema,
  loadCalibrationSuite,
  mergeJudgeRunVerdicts,
  recomputeJudgePass,
  runJudgeCalibration,
  runJudgeSuite,
  toJudgeHistorySummary,
} from "../scripts/evals/judge.ts";
import {
  invokeStructuredHarness,
  type RunSummary,
  stripMarkdownCodeFence,
} from "../scripts/evals/runner.ts";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const SAMPLE_RUBRIC: Rubric = RubricSchema.parse({
  criteria: [
    {
      id: "c-critical",
      description: "Must preview before apply",
      critical: true,
    },
    {
      id: "c-optional",
      description: "Mentions dry-run flag",
      critical: false,
    },
  ],
  min_pass_ratio: 0.5,
});

const makeRunFixture = (root: string, harness: "codex" | "agy" = "codex") => {
  const evalsDir = join(root, "evals");
  const skillsDir = join(root, "skills");
  const runDir = join(root, "run");
  mkdirSync(evalsDir, { recursive: true });
  mkdirSync(join(skillsDir, "chezmoi-cli-commands", "references"), {
    recursive: true,
  });
  mkdirSync(runDir, { recursive: true });

  writeFileSync(
    join(skillsDir, "chezmoi-cli-commands", "references", "preview.md"),
    "# Preview\nAlways run `chezmoi diff` before `chezmoi apply`.\n",
    "utf-8",
  );

  const testCases: TestCase[] = [
    {
      id: "TC-J-001",
      name: "Preview before apply",
      eval_type: "answer_quality",
      target_skill: "chezmoi-cli-commands",
      origin: "contrived",
      input: { user_prompt: "How do I apply dotfiles safely?" },
      expected: {
        answer_quality: { required_concepts: ["chezmoi diff"] },
        rubric: {
          ...SAMPLE_RUBRIC,
          include_references: ["references/preview.md"],
        },
      },
    },
    {
      id: "TC-J-002",
      name: "Failed T2 case",
      eval_type: "command_correctness",
      target_skill: "chezmoi-cli-commands",
      origin: "contrived",
      input: { user_prompt: "Show diff excluding scripts" },
      expected: {
        exact_command: "chezmoi diff --exclude=scripts",
        rubric: SAMPLE_RUBRIC,
      },
    },
    {
      id: "TC-J-003",
      name: "No inline rubric",
      eval_type: "trigger_matching",
      target_skill: "chezmoi-templating",
      origin: "contrived",
      input: { user_prompt: "Write a chezmoi template" },
      expected: { should_trigger: true },
    },
  ];

  writeFileSync(
    join(evalsDir, "suite.json"),
    JSON.stringify(testCases, null, 2),
    "utf-8",
  );

  const runSummary: RunSummary = {
    schema_version: "1",
    timestamp: "2026-11-24T12:00:00.000Z",
    commit_sha: "abcdef1234567",
    git_dirty: false,
    harness_name: harness,
    harness_version: `${harness}-cli 1.0.0`,
    model_id: "test-model",
    skill_source_sha256: "a".repeat(64),
    corpus_sha256: "b".repeat(64),
    aborted_early: false,
    abort_reason: null,
    total_cases: 3,
    passed_cases: 2,
    failed_cases: 1,
    run_scope: "full",
    failed_case_ids: ["TC-J-002"],
    unmocked_fallback_count: 0,
    cases: [
      {
        id: "TC-J-001",
        name: "Preview before apply",
        eval_type: "answer_quality",
        target_skill: "chezmoi-cli-commands",
        passed: true,
        duration_ms: 100,
        assertions: [{ name: "answer_quality", passed: true }],
        trace: {
          discovered_skills: ["chezmoi-cli-commands"],
          references_read: ["references/preview.md"],
          commands_invoked: [],
          final_response: "Run `chezmoi diff` before `chezmoi apply`.",
          trace_violations: [],
        },
      },
      {
        id: "TC-J-002",
        name: "Failed T2 case",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        passed: false,
        reason: "No commands invoked",
        duration_ms: 120,
        assertions: [{ name: "command_matches", passed: false }],
        trace: {
          discovered_skills: ["chezmoi-cli-commands"],
          references_read: [],
          commands_invoked: [],
          final_response: "Use `chezmoi apply --force`.",
          trace_violations: [],
        },
      },
      {
        id: "TC-J-003",
        name: "No inline rubric",
        eval_type: "trigger_matching",
        target_skill: "chezmoi-templating",
        passed: true,
        duration_ms: 90,
        assertions: [{ name: "skill_routing", passed: true }],
        trace: {
          discovered_skills: ["chezmoi-templating"],
          references_read: [],
          commands_invoked: [],
          final_response: "Template guidance.",
          trace_violations: [],
        },
      },
    ],
  };

  writeFileSync(
    join(runDir, "summary.json"),
    JSON.stringify(runSummary, null, 2),
    "utf-8",
  );

  return { evalsDir, skillsDir, runDir, runSummary };
};

describe("judge schemas and deterministic pass recalculation", () => {
  it("recomputes passed deterministically from critical criteria and min_pass_ratio", () => {
    const criticalFailed = recomputeJudgePass(SAMPLE_RUBRIC, [
      {
        id: "c-critical",
        passed: false,
        evidence_quotes: ["apply --force"],
        reasoning: "Skipped diff",
      },
      {
        id: "c-optional",
        passed: true,
        evidence_quotes: ["--dry-run"],
        reasoning: "Mentioned dry-run",
      },
    ]);
    expect(criticalFailed.passed).toBe(false);
    expect(criticalFailed.passRatio).toBe(0.5);

    const optionalFailedPassesRatio = recomputeJudgePass(SAMPLE_RUBRIC, [
      {
        id: "c-critical",
        passed: true,
        evidence_quotes: ["chezmoi diff"],
        reasoning: "Previewed first",
      },
      {
        id: "c-optional",
        passed: false,
        evidence_quotes: [],
        reasoning: "Did not mention --dry-run",
      },
    ]);
    expect(optionalFailedPassesRatio.passed).toBe(true);
    expect(optionalFailedPassesRatio.passRatio).toBe(0.5);

    const missingCriterion = recomputeJudgePass(SAMPLE_RUBRIC, [
      {
        id: "c-critical",
        passed: true,
        evidence_quotes: ["chezmoi diff"],
        reasoning: "Previewed first",
      },
    ]);
    expect(missingCriterion.passed).toBe(false);
    expect(missingCriterion.missingCriteria).toEqual(["c-optional"]);
  });

  it("merges 3 judge runs by per-criterion majority vote", () => {
    const vPass = {
      case_id: "TC-1",
      passed: true,
      criteria_results: [
        {
          id: "c-critical",
          passed: true,
          evidence_quotes: ["chezmoi diff"],
          reasoning: "Previewed",
        },
        {
          id: "c-optional",
          passed: false,
          evidence_quotes: [],
          reasoning: "No dry-run",
        },
      ],
      summary: "Majority pass",
    };
    const vFail = {
      case_id: "TC-1",
      passed: false,
      criteria_results: [
        {
          id: "c-critical",
          passed: false,
          evidence_quotes: [],
          reasoning: "Missed preview",
        },
        {
          id: "c-optional",
          passed: false,
          evidence_quotes: [],
          reasoning: "No dry-run",
        },
      ],
      summary: "Single fail",
    };

    const merged = mergeJudgeRunVerdicts(SAMPLE_RUBRIC, [vPass, vFail, vPass]);
    expect(merged.passed).toBe(true);
    expect(
      merged.criteria_results.find((c) => c.id === "c-critical")?.passed,
    ).toBe(true);
  });

  it("computes deterministic prompt and rubric drift hashes", () => {
    expect(JUDGE_PROMPT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const h1 = computeRubricSha256([
      { case_id: "B", rubric: SAMPLE_RUBRIC },
      { case_id: "A", rubric: SAMPLE_RUBRIC },
    ]);
    const h2 = computeRubricSha256([
      { case_id: "A", rubric: SAMPLE_RUBRIC },
      { case_id: "B", rubric: SAMPLE_RUBRIC },
    ]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes reference excerpts in buildJudgePrompt without escaping skillsDir", () => {
    const root = makeTempDir("judge-prompt");
    const { skillsDir } = makeRunFixture(root);
    const prompt = buildJudgePrompt({
      caseId: "TC-J-001",
      targetSkill: "chezmoi-cli-commands",
      userPrompt: "How do I apply?",
      trace: {
        discovered_skills: ["chezmoi-cli-commands"],
        references_read: ["references/preview.md"],
        commands_invoked: [],
        final_response: "Run `chezmoi diff` first.",
        trace_violations: [],
      },
      rubric: {
        ...SAMPLE_RUBRIC,
        include_references: ["references/preview.md", "../outside.md"],
      },
      skillsDir,
    });

    expect(prompt).toContain(
      "Always run `chezmoi diff` before `chezmoi apply`.",
    );
    expect(prompt).not.toContain("outside.md");
  });
});

describe("runJudgeSuite and cross-harness grading", () => {
  it("supports dry-run filtering and --only-passed without invoking models", async () => {
    const root = makeTempDir("judge-dry");
    const { evalsDir, skillsDir, runDir } = makeRunFixture(root, "codex");

    const dryAll = await runJudgeSuite({
      runDir,
      judgeHarness: "agy",
      dryRun: true,
      evalsDir,
      skillsDir,
    });
    expect(dryAll.dryRun).toBe(true);
    expect(dryAll.dryRunCases?.map((c) => c.case_id)).toEqual([
      "TC-J-001",
      "TC-J-002",
    ]);

    const dryPassed = await runJudgeSuite({
      runDir,
      judgeHarness: "agy",
      onlyPassed: true,
      dryRun: true,
      evalsDir,
      skillsDir,
    });
    expect(dryPassed.dryRunCases?.map((c) => c.case_id)).toEqual(["TC-J-001"]);
  });

  it("grades cross-harness, overwrites judge passed flag deterministically, and writes judge-summary.json", async () => {
    const root = makeTempDir("judge-suite");
    const { evalsDir, skillsDir, runDir, runSummary } = makeRunFixture(
      root,
      "codex",
    );

    const result = await runJudgeSuite({
      runDir,
      judgeHarness: "agy",
      judgeModel: "gemini-2.5-pro",
      onlyPassed: true,
      evalsDir,
      skillsDir,
      deps: {
        preflight: () => ({ harness_version: "agy 0.9.0" }),
        prepareAuth: (baseDir) => baseDir,
        invokeStructured: async () => ({
          ok: true,
          // Judge claims passed: true, but critical criterion failed!
          data: JudgeVerdictSchema.parse({
            case_id: "TC-J-001",
            passed: true,
            criteria_results: [
              {
                id: "c-critical",
                passed: false,
                evidence_quotes: ["Run `chezmoi diff`"],
                reasoning: "Simulated judge arithmetic mistake",
              },
              {
                id: "c-optional",
                passed: true,
                evidence_quotes: ["chezmoi diff"],
                reasoning: "Ok",
              },
            ],
            summary: "Claimed pass despite critical failure",
          }) as never,
          authOrRateLimitError: null,
          modelId: "gemini-2.5-pro",
          durationMs: 42,
          rawOutput: "{}",
          stderr: "",
        }),
      },
    });

    expect(result.dryRun).toBe(false);
    expect(result.summaryPath).toBe(join(runDir, "judge-summary.json"));
    expect(existsSync(result.summaryPath!)).toBe(true);

    const summary = JudgeSummarySchema.parse(
      JSON.parse(readFileSync(result.summaryPath!, "utf-8")),
    );
    expect(summary.judge_harness).toBe("agy");
    expect(summary.judge_version).toBe("agy 0.9.0");
    expect(summary.judge_model_id).toBe("gemini-2.5-pro");
    expect(summary.total_judged).toBe(1);
    expect(summary.passed_judged).toBe(0);
    expect(summary.failed_judged).toBe(1);
    expect(summary.error_judged).toBe(0);
    expect(summary.failed_judge_case_ids).toEqual(["TC-J-001"]);
    expect(summary.cases[0]?.verdict_status).toBe("ok");
    expect(summary.cases[0]?.passed).toBe(false);

    const historyRecord = buildHistoryRecord({
      summary: runSummary,
      judge: toJudgeHistorySummary(summary),
      corpusTotalCases: 3,
    });
    expect(historyRecord.judge?.rubric_sha256).toBe(summary.rubric_sha256);
    expect(historyRecord.judge?.judge_prompt_sha256).toBe(JUDGE_PROMPT_SHA256);
  });

  it("fails closed with verdict_status error on malformed output and aborts on auth error", async () => {
    const root = makeTempDir("judge-fail-closed");
    const { evalsDir, skillsDir, runDir } = makeRunFixture(root, "agy");

    const rubricPath = join(root, "fallback-rubric.json");
    writeFileSync(rubricPath, JSON.stringify(SAMPLE_RUBRIC), "utf-8");

    let callCount = 0;
    const result = await runJudgeSuite({
      runDir,
      judgeHarness: "codex",
      rubricPath,
      evalsDir,
      skillsDir,
      deps: {
        preflight: () => ({ harness_version: "codex 0.2.0" }),
        prepareAuth: (baseDir) => baseDir,
        invokeStructured: async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              ok: false,
              error: "Failed to parse structured JSON output",
              authOrRateLimitError: null,
              modelId: null,
              durationMs: 15,
              rawOutput: "not json",
              stderr: "",
            };
          }
          return {
            ok: false,
            error: "401 unauthorized",
            authOrRateLimitError: "401 unauthorized",
            modelId: null,
            durationMs: 10,
            rawOutput: "",
            stderr: "401 unauthorized",
          };
        },
      },
    });

    const summary = result.summary!;
    expect(summary.total_judged).toBe(2);
    expect(summary.error_judged).toBe(2);
    expect(summary.aborted_early).toBe(true);
    expect(summary.abort_reason).toBe("401 unauthorized");
    expect(summary.cases[0]?.verdict_status).toBe("error");
    expect(summary.cases[0]?.passed).toBe(false);
  });
});

describe("calibration fixture and gate", () => {
  it("validates checked-in tests/fixtures/judge_calibration.json", () => {
    const suite = loadCalibrationSuite("tests/fixtures/judge_calibration.json");
    expect(suite.length).toBeGreaterThanOrEqual(8);
    expect(suite.length).toBeLessThanOrEqual(12);
  });

  it("passes calibration when agreement >= 85% and critical false-passes == 0", async () => {
    const suite = loadCalibrationSuite("tests/fixtures/judge_calibration.json");
    let idx = 0;
    const report = await runJudgeCalibration({
      calibrationFile: "tests/fixtures/judge_calibration.json",
      judgeHarness: "codex",
      deps: {
        preflight: () => ({ harness_version: "codex 0.2.0" }),
        prepareAuth: (baseDir) => baseDir,
        invokeStructured: async () => {
          const calCase = suite[idx++]!;
          return {
            ok: true,
            data: {
              case_id: calCase.id,
              passed: calCase.expected_passed,
              criteria_results: calCase.expected_criteria.map((c) => ({
                id: c.id,
                passed: c.passed,
                evidence_quotes: [],
                reasoning: "Pinned expected verdict",
              })),
              summary: "Matches golden calibration",
            } as never,
            authOrRateLimitError: null,
            modelId: "gpt-5-codex",
            durationMs: 5,
            rawOutput: "{}",
            stderr: "",
          };
        },
      },
    });

    expect(report.passed).toBe(true);
    expect(report.agreement_rate).toBe(1);
    expect(report.critical_false_passes).toBe(0);
    expect(report.mismatches).toEqual([]);
  });

  it("fails calibration on any critical false-pass even when agreement >= 85%", async () => {
    const suite = loadCalibrationSuite("tests/fixtures/judge_calibration.json");
    // Find a case with a failing critical criterion (e.g., CAL-002)
    const criticalFailCaseId = suite.find((c) =>
      c.rubric.criteria.some(
        (crit) =>
          crit.critical &&
          c.expected_criteria.find((ec) => ec.id === crit.id)?.passed === false,
      ),
    )!.id;

    let idx = 0;
    const report = await runJudgeCalibration({
      calibrationFile: "tests/fixtures/judge_calibration.json",
      judgeHarness: "codex",
      deps: {
        preflight: () => ({ harness_version: "codex 0.2.0" }),
        prepareAuth: (baseDir) => baseDir,
        invokeStructured: async () => {
          const calCase = suite[idx++]!;
          const flip = calCase.id === criticalFailCaseId;
          return {
            ok: true,
            data: {
              case_id: calCase.id,
              passed: flip ? true : calCase.expected_passed,
              criteria_results: calCase.expected_criteria.map((c) => ({
                id: c.id,
                passed: flip ? true : c.passed,
                evidence_quotes: [],
                reasoning: "Test verdict",
              })),
              summary: "Test",
            } as never,
            authOrRateLimitError: null,
            modelId: "gpt-5-codex",
            durationMs: 5,
            rawOutput: "{}",
            stderr: "",
          };
        },
      },
    });

    expect(report.agreement_rate).toBeGreaterThanOrEqual(0.85);
    expect(report.critical_false_passes).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });
});

describe("invokeStructuredHarness and judge CLI", () => {
  it("strips markdown code fences and parses structured output from mocked codex and agy binaries", async () => {
    expect(stripMarkdownCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');

    const root = makeTempDir("structured-harness");
    const binDir = join(root, "bin");
    const workDir = join(root, "work");
    const authDir = join(root, "auth");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    mkdirSync(authDir, { recursive: true });

    const verdictPayload = {
      case_id: "TC-1",
      passed: true,
      criteria_results: [
        {
          id: "c1",
          passed: true,
          evidence_quotes: ["chezmoi diff"],
          reasoning: "Checked diff",
        },
      ],
      summary: "Passed",
    };

    const codexStub = join(binDir, "codex");
    writeFileSync(
      codexStub,
      `#!/usr/bin/env bash
out=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-o" ]]; then out="$2"; shift 2; continue; fi
  shift
done
cat >/dev/null
printf '%s' '${JSON.stringify(verdictPayload)}' > "$out"
printf '{"type":"thread.started","thread_id":"t1"}\\n'
printf '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\\n'
`,
      "utf-8",
    );
    chmodSync(codexStub, 0o755);

    const agyJsonLine = JSON.stringify({
      event: "result",
      result: {
        status: "SUCCESS",
        response: `\`\`\`json\n${JSON.stringify(verdictPayload)}\n\`\`\``,
        usage: { input_tokens: 12, output_tokens: 6 },
      },
    });
    const agyStub = join(binDir, "agy");
    writeFileSync(
      agyStub,
      `#!/usr/bin/env bash
cat <<'EOF'
${agyJsonLine}
EOF
`,
      "utf-8",
    );
    chmodSync(agyStub, 0o755);

    const origPath = process.env.PATH;
    process.env.PATH = `${binDir}:${origPath ?? ""}`;
    try {
      const codexRes = await invokeStructuredHarness({
        harness: "codex",
        prompt: "Grade this",
        schema: JudgeVerdictSchema,
        authHomeDir: authDir,
        workDir: join(workDir, "codex"),
        timeoutMs: 5000,
      });
      expect(codexRes.ok).toBe(true);
      expect(codexRes.data?.case_id).toBe("TC-1");

      const agyRes = await invokeStructuredHarness({
        harness: "agy",
        prompt: "Grade this",
        schema: JudgeVerdictSchema,
        authHomeDir: authDir,
        workDir: join(workDir, "agy"),
        timeoutMs: 5000,
      });
      expect(agyRes.ok).toBe(true);
      expect(agyRes.data?.case_id).toBe("TC-1");
    } finally {
      process.env.PATH = origPath;
    }
  });

  it("validates judge CLI flags and supports --calibrate --dry-run", async () => {
    const missingRunCode = await runCli(["node", "cli.ts", "judge"]);
    expect(missingRunCode).toBe(2);

    const badRunsCode = await runCli([
      "node",
      "cli.ts",
      "judge",
      "--calibrate",
      "--judge-runs",
      "2",
    ]);
    expect(badRunsCode).toBe(2);

    const calDryRunCode = await runCli([
      "node",
      "cli.ts",
      "judge",
      "--calibrate",
      "--dry-run",
    ]);
    expect(calDryRunCode).toBe(0);
  });
});
