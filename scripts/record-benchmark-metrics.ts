import { existsSync, mkdirSync, readFileSync, appendFileSync, copyFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { z } from "zod";

export interface BenchmarkMetricRecord {
  timestamp: string;
  commit_sha: string;
  release_tag?: string;
  branch?: string;
  trigger_event?: string;
  eval_suite_version?: string;
  models?: string[];
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  skill_metrics?: Record<
    string,
    {
      total_tests: number;
      passed: number;
      failed: number;
      pass_rate: number;
    }
  >;
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

const providerSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    label: z.string().optional(),
  }),
]);

const singleResultSchema = z.object({
  target_skill: z.string().optional(),
  skill: z.string().optional(),
  status: z.string().optional(),
  success: z.boolean().optional(),
  provider: providerSchema.optional(),
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
  config: z
    .object({
      providers: z.array(providerSchema).optional(),
    })
    .optional(),
});

export interface ExtractMetricsOptions {
  fileContent: string;
  commitSha: string;
  customTimestamp?: string;
  releaseTag?: string;
  branch?: string;
  triggerEvent?: string;
  evalSuiteVersion?: string;
}

export function extractMetrics(
  fileContent: string,
  commitSha: string,
  customTimestamp?: string,
  extraOptions?: Partial<ExtractMetricsOptions>
): BenchmarkMetricRecord {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to parse results JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const parsed = resultsFileSchema.parse(parsedJson);

  const timestamp = customTimestamp || extraOptions?.customTimestamp || parsed.benchmark_run?.timestamp || new Date().toISOString();
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let passRate = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  const modelSet = new Set<string>();
  const skillCounts: Record<string, { total_tests: number; passed: number; failed: number }> = {};

  if (parsed.config?.providers) {
    for (const p of parsed.config.providers) {
      const id = typeof p === "string" ? p : p.id || p.label;
      if (id) modelSet.add(id);
    }
  }

  if (parsed.results && parsed.results.length > 0) {
    totalTests = parsed.results.length;
    for (const r of parsed.results) {
      const isPass = r.status === "PASS" || r.success === true;
      if (isPass) {
        passed++;
      } else {
        failed++;
      }
      const pTokens = r.tokens?.prompt_tokens ?? r.tokenUsage?.prompt ?? 0;
      const cTokens = r.tokens?.completion_tokens ?? r.tokenUsage?.completion ?? 0;
      promptTokens += pTokens;
      completionTokens += cTokens;

      if (r.provider) {
        const id = typeof r.provider === "string" ? r.provider : r.provider.id || r.provider.label;
        if (id) modelSet.add(id);
      }

      const skillName = r.target_skill || r.skill;
      if (skillName) {
        if (!skillCounts[skillName]) {
          skillCounts[skillName] = { total_tests: 0, passed: 0, failed: 0 };
        }
        skillCounts[skillName].total_tests++;
        if (isPass) {
          skillCounts[skillName].passed++;
        } else {
          skillCounts[skillName].failed++;
        }
      }
    }
    passRate = totalTests > 0 ? passed / totalTests : 0;
  } else if (parsed.benchmark_run?.metrics) {
    const m = parsed.benchmark_run.metrics;
    totalTests = m.total_tests;
    passed = m.passed;
    failed = m.failed;
    passRate = m.pass_rate;
    promptTokens = m.total_prompt_tokens;
    completionTokens = m.total_completion_tokens;
  }

  const skillMetrics: Record<string, { total_tests: number; passed: number; failed: number; pass_rate: number }> = {};
  for (const [sName, sData] of Object.entries(skillCounts)) {
    skillMetrics[sName] = {
      total_tests: sData.total_tests,
      passed: sData.passed,
      failed: sData.failed,
      pass_rate: sData.total_tests > 0 ? Number((sData.passed / sData.total_tests).toFixed(4)) : 0,
    };
  }

  const dateStr = timestamp.slice(0, 10);
  const shortSha = commitSha.slice(0, 7) || "unknown";
  const runDir = `runs/${dateStr}_${shortSha}`;

  const record: BenchmarkMetricRecord = {
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

  if (extraOptions?.releaseTag) record.release_tag = extraOptions.releaseTag;
  if (extraOptions?.branch) record.branch = extraOptions.branch;
  if (extraOptions?.triggerEvent) record.trigger_event = extraOptions.triggerEvent;
  if (extraOptions?.evalSuiteVersion) record.eval_suite_version = extraOptions.evalSuiteVersion;
  if (modelSet.size > 0) record.models = Array.from(modelSet);
  if (Object.keys(skillMetrics).length > 0) record.skill_metrics = skillMetrics;

  return record;
}

export function recordMetrics(options: {
  resultsFile: string;
  htmlFile: string;
  dbFile: string;
  targetDir: string;
  commitSha: string;
  timestamp?: string;
  releaseTag?: string;
  branch?: string;
  triggerEvent?: string;
  evalSuiteVersion?: string;
}): BenchmarkMetricRecord {
  if (!existsSync(options.resultsFile)) {
    throw new Error(`Results file not found: ${options.resultsFile}`);
  }

  const rawJson = readFileSync(options.resultsFile, "utf-8");
  const record = extractMetrics(rawJson, options.commitSha, options.timestamp, {
    releaseTag: options.releaseTag,
    branch: options.branch,
    triggerEvent: options.triggerEvent,
    evalSuiteVersion: options.evalSuiteVersion,
  });

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
    .option("--release-tag <tag>", "Git release tag (e.g. v0.1.0)")
    .option("--branch <branch>", "Git branch name", process.env.GITHUB_REF_NAME || "main")
    .option("--trigger-event <event>", "Workflow trigger event", process.env.GITHUB_EVENT_NAME || "manual")
    .option("--eval-suite-version <version>", "Evaluation suite version or commit SHA")
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
      releaseTag: opts.releaseTag,
      branch: opts.branch,
      triggerEvent: opts.triggerEvent,
      evalSuiteVersion: opts.evalSuiteVersion,
    });
    console.log(`Recorded benchmark metrics to ${join(opts.targetDir, record.run_dir)}`);
  } catch (error) {
    console.error(`Error recording benchmark metrics: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
