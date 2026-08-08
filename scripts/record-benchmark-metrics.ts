import { existsSync, mkdirSync, readFileSync, appendFileSync, copyFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { z } from "zod";

export interface BenchmarkMetricRecord {
  timestamp: string;
  commit_sha: string;
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  run_dir: string;
}

const metricsSchema = z.object({
  total_tests: z.number().default(0),
  passed: z.number().default(0),
  failed: z.number().default(0),
  pass_rate: z.number().default(0),
  total_prompt_tokens: z.number().default(0),
  total_completion_tokens: z.number().default(0),
});

const benchmarkRunSchema = z.object({
  timestamp: z.string().optional(),
  metrics: metricsSchema.optional(),
});

const singleResultSchema = z.object({
  status: z.string().optional(),
  success: z.boolean().optional(),
  tokens: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
  tokenUsage: z
    .object({
      prompt: z.number().optional(),
      completion: z.number().optional(),
    })
    .optional(),
});

const resultsFileSchema = z.object({
  benchmark_run: benchmarkRunSchema.optional(),
  results: z.array(singleResultSchema).optional(),
});

export function extractMetrics(
  fileContent: string,
  commitSha: string,
  customTimestamp?: string
): BenchmarkMetricRecord {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to parse results JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = resultsFileSchema.parse(parsedJson);

  const timestamp = customTimestamp || parsed.benchmark_run?.timestamp || new Date().toISOString();
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let passRate = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  if (parsed.benchmark_run?.metrics) {
    const m = parsed.benchmark_run.metrics;
    totalTests = m.total_tests;
    passed = m.passed;
    failed = m.failed;
    passRate = m.pass_rate;
    promptTokens = m.total_prompt_tokens;
    completionTokens = m.total_completion_tokens;
  } else if (parsed.results && parsed.results.length > 0) {
    totalTests = parsed.results.length;
    for (const r of parsed.results) {
      if (r.status === "PASS" || r.success === true) {
        passed++;
      } else {
        failed++;
      }
      const pTokens = r.tokens?.prompt_tokens ?? r.tokenUsage?.prompt ?? 0;
      const cTokens = r.tokens?.completion_tokens ?? r.tokenUsage?.completion ?? 0;
      promptTokens += pTokens;
      completionTokens += cTokens;
    }
    passRate = totalTests > 0 ? passed / totalTests : 0;
  }

  const dateStr = timestamp.slice(0, 10);
  const shortSha = commitSha.slice(0, 7) || "unknown";
  const runDir = `runs/${dateStr}_${shortSha}`;

  return {
    timestamp,
    commit_sha: shortSha,
    total_tests: totalTests,
    passed,
    failed,
    pass_rate: Number(passRate.toFixed(4)),
    total_prompt_tokens: promptTokens,
    total_completion_tokens: completionTokens,
    run_dir: runDir,
  };
}

export function recordMetrics(options: {
  resultsFile: string;
  htmlFile: string;
  dbFile: string;
  targetDir: string;
  commitSha: string;
  timestamp?: string;
}): BenchmarkMetricRecord {
  if (!existsSync(options.resultsFile)) {
    throw new Error(`Results file not found: ${options.resultsFile}`);
  }

  const rawJson = readFileSync(options.resultsFile, "utf-8");
  const record = extractMetrics(rawJson, options.commitSha, options.timestamp);

  const fullRunDir = join(options.targetDir, record.run_dir);
  mkdirSync(fullRunDir, { recursive: true });

  copyFileSync(options.resultsFile, join(fullRunDir, "results.json"));

  if (existsSync(options.htmlFile)) {
    copyFileSync(options.htmlFile, join(fullRunDir, "index.html"));
  }

  if (existsSync(options.dbFile)) {
    copyFileSync(options.dbFile, join(fullRunDir, "promptfoo.db"));
  }

  const historyPath = join(options.targetDir, "history.jsonl");
  appendFileSync(historyPath, JSON.stringify(record) + "\n", "utf-8");

  return record;
}

if (import.meta.main) {
  const program = new Command();
  program
    .option("--results-file <path>", "Path to promptfoo results JSON file", "eval_results/results.json")
    .option("--html-file <path>", "Path to promptfoo HTML report file", "eval_results/index.html")
    .option("--db-file <path>", "Path to promptfoo DB file", "promptfoo.db")
    .option("--target-dir <path>", "Directory for benchmark history storage", ".")
    .option("--commit-sha <sha>", "Git commit SHA", process.env.GITHUB_SHA || "local")
    .option("--timestamp <iso-string>", "Optional timestamp override")
    .parse(process.argv);

  const opts = program.opts();

  try {
    const record = recordMetrics({
      resultsFile: opts.resultsFile,
      htmlFile: opts.htmlFile,
      dbFile: opts.dbFile,
      targetDir: opts.targetDir,
      commitSha: opts.commitSha,
      timestamp: opts.timestamp,
    });
    console.log(`Recorded benchmark metrics to ${join(opts.targetDir, record.run_dir)}`);
  } catch (error) {
    console.error(`Error recording benchmark metrics: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
