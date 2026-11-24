import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";
import { z } from "zod";
import { sha256 } from "./hash.ts";
import {
  type CaseResult,
  ConfigError,
  type HarnessName,
  type RunSummary,
} from "./runner.ts";

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

export type TokenUsageAggregate = z.infer<typeof TokenUsageAggregateSchema>;
export type LatencyAggregate = z.infer<typeof LatencyAggregateSchema>;
export type JudgeHistorySummary = z.infer<typeof JudgeHistorySummarySchema>;
export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

export interface RecordIdentityInput {
  commit_sha: string;
  git_dirty: boolean;
  harness_name: HarnessName;
  harness_version: string;
  model_id: string | null;
  skill_source_sha256: string;
  corpus_sha256: string;
  run_scope: "full" | "smoke";
  judge?: JudgeHistorySummary | null;
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
};

/**
 * Computes the deterministic SHA-256 record identifier from run identity fields.
 */
export const computeRecordId = (input: RecordIdentityInput): string => {
  const identity = {
    commit_sha: input.commit_sha,
    git_dirty: input.git_dirty,
    harness_name: input.harness_name,
    harness_version: input.harness_version,
    model_id: input.model_id,
    skill_source_sha256: input.skill_source_sha256,
    corpus_sha256: input.corpus_sha256,
    run_scope: input.run_scope,
    judge: input.judge
      ? {
          judge_harness: input.judge.judge_harness,
          judge_version: input.judge.judge_version,
          judge_model_id: input.judge.judge_model_id,
          rubric_sha256: input.judge.rubric_sha256,
          judge_prompt_sha256: input.judge.judge_prompt_sha256,
        }
      : null,
  };
  return sha256(canonicalJson(identity));
};

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Aggregates token usage across all case results with valid non-negative integer usage fields.
 */
export const aggregateTokenUsage = (
  cases: CaseResult[],
): TokenUsageAggregate => {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let casesWithUsage = 0;

  for (const item of cases) {
    const usage = item.usage;
    if (!usage || typeof usage !== "object") {
      continue;
    }
    const hasInput = isNonNegativeInt(usage.input_tokens);
    const hasCached = isNonNegativeInt(usage.cached_input_tokens);
    const hasOutput = isNonNegativeInt(usage.output_tokens);
    if (!hasInput && !hasCached && !hasOutput) {
      continue;
    }

    casesWithUsage += 1;
    inputTokens += hasInput ? (usage.input_tokens as number) : 0;
    cachedInputTokens += hasCached ? (usage.cached_input_tokens as number) : 0;
    outputTokens += hasOutput ? (usage.output_tokens as number) : 0;
  }

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    cases_with_usage: casesWithUsage,
  };
};

/**
 * Aggregates total, mean, and nearest-rank 95th percentile latency across executed cases.
 */
export const aggregateLatencyMs = (cases: CaseResult[]): LatencyAggregate => {
  const n = cases.length;
  if (n === 0) {
    return { total_ms: 0, mean_ms: 0, p95_ms: 0 };
  }

  const totalMs = Math.max(
    0,
    Math.round(cases.reduce((sum, item) => sum + item.duration_ms, 0)),
  );
  const meanMs = Math.round(totalMs / n);
  const sorted = cases
    .map((item) => Math.max(0, Math.round(item.duration_ms)))
    .sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(0.95 * n) - 1);
  const p95Ms = sorted[p95Index] ?? 0;

  return {
    total_ms: totalMs,
    mean_ms: meanMs,
    p95_ms: p95Ms,
  };
};

/**
 * Builds a schema-validated `HistoryRecord` from a completed `RunSummary` and optional judge summary.
 */
export const buildHistoryRecord = (params: {
  summary: RunSummary;
  judge?: JudgeHistorySummary;
  corpusTotalCases?: number;
}): HistoryRecord => {
  const { summary, judge, corpusTotalCases } = params;

  if (summary.run_scope !== "full" && summary.run_scope !== "smoke") {
    throw new ConfigError(
      `Cannot record history for run_scope "${summary.run_scope ?? "missing"}": only "full" and "smoke" runs are recorded.`,
    );
  }

  if (summary.commit_sha === "unknown") {
    throw new ConfigError(
      "Cannot record history without a valid git commit SHA.",
    );
  }

  const executedTotal = summary.passed_cases + summary.failed_cases;
  const skippedCases =
    corpusTotalCases !== undefined
      ? Math.max(0, corpusTotalCases - executedTotal)
      : (summary.skipped_cases ?? 0);
  const totalCases = executedTotal + skippedCases;

  const recordId = computeRecordId({
    commit_sha: summary.commit_sha,
    git_dirty: summary.git_dirty,
    harness_name: summary.harness_name,
    harness_version: summary.harness_version,
    model_id: summary.model_id,
    skill_source_sha256: summary.skill_source_sha256,
    corpus_sha256: summary.corpus_sha256,
    run_scope: summary.run_scope,
    judge: judge ?? null,
  });

  const candidate = {
    schema_version: "1" as const,
    record_id: recordId,
    timestamp: summary.timestamp,
    commit_sha: summary.commit_sha,
    git_dirty: summary.git_dirty,
    harness_name: summary.harness_name,
    harness_version: summary.harness_version,
    model_id: summary.model_id,
    skill_source_sha256: summary.skill_source_sha256,
    corpus_sha256: summary.corpus_sha256,
    run_scope: summary.run_scope,
    total_cases: totalCases,
    passed_cases: summary.passed_cases,
    failed_cases: summary.failed_cases,
    skipped_cases: skippedCases,
    tokens: aggregateTokenUsage(summary.cases),
    latency_ms: aggregateLatencyMs(summary.cases),
    ...(judge ? { judge } : {}),
  };

  return HistoryRecordSchema.parse(candidate);
};

interface ParsedHistoryLine {
  lineNumber: number;
  record: HistoryRecord;
}

const parseHistoryFileLines = (historyPath: string): ParsedHistoryLine[] => {
  if (!existsSync(historyPath)) {
    return [];
  }

  const content = readFileSync(historyPath, "utf-8");
  const lines = content.split(/\r?\n/);
  const parsed: ParsedHistoryLine[] = [];

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid JSON in ${historyPath}:${lineNumber}: ${message}`,
      );
    }

    const result = HistoryRecordSchema.safeParse(json);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      throw new Error(
        `Invalid history record in ${historyPath}:${lineNumber}: ${details}`,
      );
    }

    parsed.push({ lineNumber, record: result.data });
  }

  return parsed;
};

/**
 * Loads history records from a JSONL ledger and returns them sorted by `timestamp` ascending.
 */
export const loadHistory = (historyPath: string): HistoryRecord[] => {
  return parseHistoryFileLines(historyPath)
    .map((entry) => entry.record)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
};

/**
 * Validates a JSONL history ledger for schema conformance and unique `record_id` entries.
 */
export const validateHistoryFile = (
  historyPath: string,
): { count: number; records: HistoryRecord[] } => {
  const entries = parseHistoryFileLines(historyPath);
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const firstLine = seen.get(entry.record.record_id);
    if (firstLine !== undefined) {
      throw new Error(
        `Duplicate record_id ${entry.record.record_id} in ${historyPath}:${entry.lineNumber} (first seen at line ${firstLine}).`,
      );
    }
    seen.set(entry.record.record_id, entry.lineNumber);
  }

  const records = entries
    .map((entry) => entry.record)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { count: records.length, records };
};

/**
 * Appends a single history record to the JSONL ledger unless its `record_id` already exists.
 */
export const appendHistoryRecord = (
  historyPath: string,
  record: HistoryRecord,
): { appended: boolean; recordId: string } => {
  const validated = HistoryRecordSchema.parse(record);

  if (existsSync(historyPath)) {
    const existing = parseHistoryFileLines(historyPath);
    if (
      existing.some((entry) => entry.record.record_id === validated.record_id)
    ) {
      console.log(
        `Skipped duplicate history entry ${validated.record_id.slice(0, 12)}`,
      );
      return { appended: false, recordId: validated.record_id };
    }

    const rawExisting = readFileSync(historyPath, "utf-8");
    const needsLeadingNewline =
      rawExisting.length > 0 && !rawExisting.endsWith("\n");
    appendFileSync(
      historyPath,
      `${needsLeadingNewline ? "\n" : ""}${JSON.stringify(validated)}\n`,
      "utf-8",
    );
    return { appended: true, recordId: validated.record_id };
  }

  mkdirSync(dirname(historyPath), { recursive: true });
  writeFileSync(historyPath, `${JSON.stringify(validated)}\n`, "utf-8");
  return { appended: true, recordId: validated.record_id };
};
