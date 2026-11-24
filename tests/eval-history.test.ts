import { afterEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../scripts/evals/cli.ts";
import {
  aggregateLatencyMs,
  aggregateTokenUsage,
  appendHistoryRecord,
  buildHistoryRecord,
  computeRecordId,
  HistoryRecordSchema,
  type JudgeHistorySummary,
  loadHistory,
  validateHistoryFile,
} from "../scripts/evals/history.ts";
import {
  type CaseResult,
  ConfigError,
  type RunSummary,
} from "../scripts/evals/runner.ts";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

const makeCaseResult = (
  id: string,
  durationMs: number,
  passed = true,
  usage?: Record<string, unknown>,
): CaseResult => ({
  id,
  name: `Case ${id}`,
  eval_type: "command_correctness",
  target_skill: "chezmoi-cli-commands",
  passed,
  duration_ms: durationMs,
  assertions: [{ name: "command_matches", passed }],
  trace: {
    discovered_skills: ["chezmoi-cli-commands"],
    references_read: [],
    commands_invoked: ["chezmoi status"],
    final_response: "Run `chezmoi status`.",
    trace_violations: [],
  },
  ...(usage !== undefined ? { usage } : {}),
});

const makeRunSummary = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  schema_version: "1",
  timestamp: "2026-11-24T12:00:00.000Z",
  commit_sha: "abc1234",
  git_dirty: false,
  harness_name: "codex",
  harness_version: "codex-cli 0.1.0",
  model_id: "gpt-5-codex",
  skill_source_sha256: SHA_A,
  corpus_sha256: SHA_B,
  aborted_early: false,
  abort_reason: null,
  total_cases: 2,
  passed_cases: 2,
  failed_cases: 0,
  skipped_cases: 0,
  run_scope: "full",
  failed_case_ids: [],
  unmocked_fallback_count: 0,
  cases: [
    makeCaseResult("TC-1", 100, true, {
      input_tokens: 100,
      cached_input_tokens: 20,
      output_tokens: 30,
    }),
    makeCaseResult("TC-2", 200, true, {
      input_tokens: 50,
      output_tokens: 10,
    }),
  ],
  ...overrides,
});

const makeJudgeSummary = (): JudgeHistorySummary => ({
  judge_harness: "codex",
  judge_version: "codex-cli 0.1.0",
  judge_model_id: "gpt-5-codex",
  rubric_sha256: SHA_C,
  judge_prompt_sha256: SHA_D,
  total_judged: 2,
  passed_judged: 2,
  failed_judged: 0,
  error_judged: 0,
});

describe("HistoryRecordSchema", () => {
  it("accepts valid T2-only and T2+T3 records", () => {
    const t2 = buildHistoryRecord({ summary: makeRunSummary() });
    expect(HistoryRecordSchema.parse(t2)).toEqual(t2);

    const t3 = buildHistoryRecord({
      summary: makeRunSummary(),
      judge: makeJudgeSummary(),
    });
    expect(HistoryRecordSchema.parse(t3)).toEqual(t3);
  });

  it("rejects records where total_cases does not equal passed + failed + skipped", () => {
    const record = buildHistoryRecord({ summary: makeRunSummary() });
    const invalid = { ...record, total_cases: record.total_cases + 1 };
    expect(() => HistoryRecordSchema.parse(invalid)).toThrow(
      "total_cases must equal passed_cases + failed_cases + skipped_cases.",
    );
  });
});

describe("token and latency aggregation", () => {
  it("aggregates token usage and ignores absent or malformed usage", () => {
    const cases = [
      makeCaseResult("TC-1", 100, true, {
        input_tokens: 120,
        cached_input_tokens: 40,
        output_tokens: 30,
      }),
      makeCaseResult("TC-2", 100, true, {
        input_tokens: 80,
        output_tokens: 20,
      }),
      makeCaseResult("TC-3", 100, true, {
        input_tokens: -5,
        output_tokens: 1.5,
      }),
      makeCaseResult("TC-4", 100, true),
    ];

    expect(aggregateTokenUsage(cases)).toEqual({
      input_tokens: 200,
      cached_input_tokens: 40,
      output_tokens: 50,
      cases_with_usage: 2,
    });

    expect(aggregateTokenUsage([makeCaseResult("TC-5", 100)])).toEqual({
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      cases_with_usage: 0,
    });
  });

  it("computes total, mean, and nearest-rank p95 latency", () => {
    expect(aggregateLatencyMs([])).toEqual({
      total_ms: 0,
      mean_ms: 0,
      p95_ms: 0,
    });

    const durations = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    const cases = durations.map((d, i) => makeCaseResult(`TC-${i}`, d));
    // sum = 21000, mean = 1050, ceil(0.95 * 20) - 1 = 18 => 1900
    expect(aggregateLatencyMs(cases)).toEqual({
      total_ms: 21000,
      mean_ms: 1050,
      p95_ms: 1900,
    });
  });
});

describe("computeRecordId and buildHistoryRecord", () => {
  it("differentiates T2-only and judged runs and stays deterministic", () => {
    const base = {
      commit_sha: "abc1234",
      git_dirty: false,
      harness_name: "codex" as const,
      harness_version: "codex-cli 0.1.0",
      model_id: "gpt-5-codex",
      skill_source_sha256: SHA_A,
      corpus_sha256: SHA_B,
      run_scope: "full" as const,
    };

    const id1 = computeRecordId(base);
    const id2 = computeRecordId({ ...base });
    const idJudged = computeRecordId({ ...base, judge: makeJudgeSummary() });

    expect(id1).toBe(id2);
    expect(id1).not.toBe(idJudged);
  });

  it("rejects filtered, missing run_scope, or unknown commit_sha", () => {
    expect(() =>
      buildHistoryRecord({
        summary: makeRunSummary({ run_scope: "filtered" }),
      }),
    ).toThrow(ConfigError);

    const noScope = makeRunSummary();
    delete noScope.run_scope;
    expect(() => buildHistoryRecord({ summary: noScope })).toThrow(ConfigError);

    expect(() =>
      buildHistoryRecord({
        summary: makeRunSummary({ commit_sha: "unknown" }),
      }),
    ).toThrow(ConfigError);
  });

  it("computes skipped_cases and total_cases from corpusTotalCases", () => {
    const record = buildHistoryRecord({
      summary: makeRunSummary({
        run_scope: "smoke",
        total_cases: 2,
        passed_cases: 1,
        failed_cases: 1,
      }),
      corpusTotalCases: 10,
    });

    expect(record.total_cases).toBe(10);
    expect(record.passed_cases).toBe(1);
    expect(record.failed_cases).toBe(1);
    expect(record.skipped_cases).toBe(8);
  });
});

describe("appendHistoryRecord, loadHistory, and validateHistoryFile", () => {
  it("appends records, skips duplicates, and sorts loaded records by timestamp", () => {
    const dir = makeTempDir("chezmoi-history-");
    const historyPath = join(dir, "nested", "history.jsonl");

    expect(loadHistory(historyPath)).toEqual([]);

    const later = buildHistoryRecord({
      summary: makeRunSummary({
        timestamp: "2026-11-24T15:00:00.000Z",
        commit_sha: "1111111",
      }),
    });
    const earlier = buildHistoryRecord({
      summary: makeRunSummary({
        timestamp: "2026-11-24T10:00:00.000Z",
        commit_sha: "2222222",
      }),
    });

    expect(appendHistoryRecord(historyPath, later).appended).toBe(true);
    expect(appendHistoryRecord(historyPath, later).appended).toBe(false);
    expect(appendHistoryRecord(historyPath, earlier).appended).toBe(true);

    const rawLines = readFileSync(historyPath, "utf-8").trim().split("\n");
    expect(rawLines.length).toBe(2);

    const loaded = loadHistory(historyPath);
    expect(loaded.map((r) => r.commit_sha)).toEqual(["2222222", "1111111"]);
    expect(validateHistoryFile(historyPath).count).toBe(2);
  });

  it("rejects malformed JSONL and duplicate record_id entries", () => {
    const dir = makeTempDir("chezmoi-history-bad-");
    const conflictPath = join(dir, "conflict.jsonl");
    writeFileSync(conflictPath, "<<<<<<< HEAD\n", "utf-8");
    expect(() => validateHistoryFile(conflictPath)).toThrow("Invalid JSON");

    const dupPath = join(dir, "dup.jsonl");
    const record = buildHistoryRecord({ summary: makeRunSummary() });
    const line = JSON.stringify(record);
    writeFileSync(dupPath, `${line}\n${line}\n`, "utf-8");
    expect(() => validateHistoryFile(dupPath)).toThrow("Duplicate record_id");
  });
});

describe("CLI validate and --record-history guards", () => {
  it("validates history.jsonl in evals-dir when present and fails on invalid history", async () => {
    const dir = makeTempDir("chezmoi-cli-validate-");
    const evalsDir = join(dir, "evals");
    mkdirSync(evalsDir, { recursive: true });
    writeFileSync(
      join(evalsDir, "sample.json"),
      JSON.stringify([
        {
          id: "TC-SAMPLE-001",
          name: "Sample case",
          eval_type: "trigger_matching",
          target_skill: "chezmoi-cli-commands",
          input: { user_prompt: "Show chezmoi status" },
          expected: { should_trigger: true },
        },
      ]),
      "utf-8",
    );

    const historyPath = join(evalsDir, "history.jsonl");
    const record = buildHistoryRecord({ summary: makeRunSummary() });
    appendHistoryRecord(historyPath, record);

    expect(
      await runCli(["bun", "cli.ts", "validate", "--evals-dir", evalsDir]),
    ).toBe(0);

    writeFileSync(historyPath, `${JSON.stringify(record)}\n<<<<<<< HEAD\n`);
    expect(
      await runCli(["bun", "cli.ts", "validate", "--evals-dir", evalsDir]),
    ).toBe(2);
  });

  it("rejects --record-history with filters and skips writing on --dry-run", async () => {
    const dir = makeTempDir("chezmoi-cli-record-");
    const historyPath = join(dir, "history.jsonl");

    for (const flag of [
      ["--skill", "chezmoi-cli-commands"],
      ["--case", "TC-TRIG-001"],
      ["--origin", "contrived"],
    ]) {
      const code = await runCli([
        "bun",
        "cli.ts",
        "run",
        "--record-history",
        "--history-file",
        historyPath,
        ...flag,
        "--dry-run",
      ]);
      expect(code).toBe(2);
    }

    const dryRunCode = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--smoke",
      "--record-history",
      "--history-file",
      historyPath,
      "--dry-run",
    ]);
    expect(dryRunCode).toBe(0);
    expect(existsSync(historyPath)).toBe(false);
  });
});
