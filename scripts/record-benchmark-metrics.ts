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
  configured_models?: string[];
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
  surface_metrics?: Record<string, MetricSummary>;
  provider_metrics?: Record<string, MetricSummary>;
  provider_surface_metrics?: Record<string, Record<string, MetricSummary>>;
  suite_metrics?: Record<string, MetricSummary>;
  run_dir: string;
}

export interface MetricSummary {
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
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

const metadataSchema = z
  .object({
    target_skill: z.string().optional(),
  })
  .passthrough();

const promptSchema = z
  .object({
    label: z.string().optional(),
  })
  .passthrough();

const promptfooTestCaseSchema = z
  .object({
    metadata: metadataSchema.optional(),
    vars: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

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
  prompt: promptSchema.optional(),
  metadata: metadataSchema.optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  testCase: promptfooTestCaseSchema.optional(),
}).passthrough();

const promptfooResultsSchema = z
  .object({
    timestamp: z.string().optional(),
    results: z.array(singleResultSchema).optional(),
  })
  .passthrough();

const resultsFileSchema = z.object({
  benchmark_run: benchmarkRunSchema.optional(),
  results: z.union([z.array(singleResultSchema), promptfooResultsSchema]).optional(),
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

  const promptfooResults = parsed.results && !Array.isArray(parsed.results) ? parsed.results : undefined;
  const timestamp =
    customTimestamp ||
    extraOptions?.customTimestamp ||
    parsed.benchmark_run?.timestamp ||
    promptfooResults?.timestamp ||
    new Date().toISOString();
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let passRate = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  const modelSet = new Set<string>();
  const configuredModelSet = new Set<string>();
  const skillCounts: Record<string, { total_tests: number; passed: number; failed: number }> = {};
  const surfaceCounts: Record<string, { total_tests: number; passed: number; failed: number }> = {};
  const providerCounts: Record<string, { total_tests: number; passed: number; failed: number }> = {};
  const providerSurfaceCounts: Record<string, Record<string, { total_tests: number; passed: number; failed: number }>> = {};

  if (parsed.config?.providers) {
    for (const p of parsed.config.providers) {
      const id = typeof p === "string" ? p : p.id || p.label;
      if (id) configuredModelSet.add(id);
    }
  }

  const results = Array.isArray(parsed.results) ? parsed.results : promptfooResults?.results;
  if (results && results.length > 0) {
    totalTests = results.length;
    for (const r of results) {
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

      const providerName = r.provider
        ? typeof r.provider === "string"
          ? r.provider
          : r.provider.id || r.provider.label
        : undefined;
      if (providerName) {
          modelSet.add(providerName);
          if (!providerCounts[providerName]) providerCounts[providerName] = { total_tests: 0, passed: 0, failed: 0 };
          providerCounts[providerName].total_tests++;
          if (isPass) providerCounts[providerName].passed++;
          else providerCounts[providerName].failed++;
        }

      const skillName =
        r.target_skill ||
        r.skill ||
        r.metadata?.target_skill ||
        (typeof r.vars?.target_skill === "string" ? r.vars.target_skill : undefined) ||
        r.testCase?.metadata?.target_skill ||
        (typeof r.testCase?.vars?.target_skill === "string" ? r.testCase.vars.target_skill : undefined);
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

      const surfaceName = r.prompt?.label;
      if (surfaceName) {
        if (!surfaceCounts[surfaceName]) {
          surfaceCounts[surfaceName] = { total_tests: 0, passed: 0, failed: 0 };
        }
        surfaceCounts[surfaceName].total_tests++;
        if (isPass) {
          surfaceCounts[surfaceName].passed++;
        } else {
          surfaceCounts[surfaceName].failed++;
        }
        if (providerName) {
          if (!providerSurfaceCounts[providerName]) providerSurfaceCounts[providerName] = {};
          if (!providerSurfaceCounts[providerName][surfaceName]) {
            providerSurfaceCounts[providerName][surfaceName] = { total_tests: 0, passed: 0, failed: 0 };
          }
          const counts = providerSurfaceCounts[providerName][surfaceName];
          counts.total_tests++;
          if (isPass) counts.passed++;
          else counts.failed++;
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

  const surfaceMetrics: Record<string, MetricSummary> = {};
  for (const [surfaceName, surfaceData] of Object.entries(surfaceCounts)) {
    surfaceMetrics[surfaceName] = {
      total_tests: surfaceData.total_tests,
      passed: surfaceData.passed,
      failed: surfaceData.failed,
      pass_rate: surfaceData.total_tests > 0 ? Number((surfaceData.passed / surfaceData.total_tests).toFixed(4)) : 0,
    };
  }

  const providerMetrics: Record<string, MetricSummary> = {};
  for (const [providerName, providerData] of Object.entries(providerCounts)) {
    providerMetrics[providerName] = {
      total_tests: providerData.total_tests,
      passed: providerData.passed,
      failed: providerData.failed,
      pass_rate: providerData.total_tests > 0 ? Number((providerData.passed / providerData.total_tests).toFixed(4)) : 0,
    };
  }

  const providerSurfaceMetrics: Record<string, Record<string, MetricSummary>> = {};
  for (const [providerName, surfaces] of Object.entries(providerSurfaceCounts)) {
    providerSurfaceMetrics[providerName] = {};
    for (const [surfaceName, counts] of Object.entries(surfaces)) {
      providerSurfaceMetrics[providerName][surfaceName] = {
        total_tests: counts.total_tests,
        passed: counts.passed,
        failed: counts.failed,
        pass_rate: counts.total_tests > 0 ? Number((counts.passed / counts.total_tests).toFixed(4)) : 0,
      };
    }
  }

  const runTimestamp = timestamp.replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
  const shortSha = commitSha.slice(0, 7) || "unknown";
  const runDir = `runs/${runTimestamp}_${shortSha}`;

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
  if (configuredModelSet.size > 0) record.configured_models = Array.from(configuredModelSet);
  if (Object.keys(skillMetrics).length > 0) record.skill_metrics = skillMetrics;
  if (Object.keys(surfaceMetrics).length > 0) record.surface_metrics = surfaceMetrics;
  if (Object.keys(providerMetrics).length > 0) record.provider_metrics = providerMetrics;
  if (Object.keys(providerSurfaceMetrics).length > 0) record.provider_surface_metrics = providerSurfaceMetrics;

  return record;
}

export function recordMetrics(options: {
  resultsFile: string;
  htmlFile: string;
  dbFile: string;
  routerResultsFile?: string;
  routerHtmlFile?: string;
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

  const suiteMetrics: Record<string, MetricSummary> = {
    answer: {
      total_tests: record.total_tests,
      passed: record.passed,
      failed: record.failed,
      pass_rate: record.pass_rate,
    },
  };
  const routerResultsFile = options.routerResultsFile;
  if (routerResultsFile && existsSync(routerResultsFile)) {
    const routerRecord = extractMetrics(readFileSync(routerResultsFile, "utf-8"), options.commitSha, record.timestamp);
    suiteMetrics.router = {
      total_tests: routerRecord.total_tests,
      passed: routerRecord.passed,
      failed: routerRecord.failed,
      pass_rate: routerRecord.pass_rate,
    };
    copyFileSync(routerResultsFile, join(fullRunDir, "router-results.json"));
    if (options.routerHtmlFile && existsSync(options.routerHtmlFile)) {
      copyFileSync(options.routerHtmlFile, join(fullRunDir, "router-index.html"));
    }
  }
  record.suite_metrics = suiteMetrics;

  const historyPath = join(options.targetDir, "history.jsonl");
  appendFileSync(historyPath, JSON.stringify(record) + "\n", "utf-8");

  return record;
}

if (import.meta.main) {
  const program = new Command();
  program
    .option("--results-file <path>", "Path to promptfoo results JSON file", "eval_results/results.json")
    .option("--html-file <path>", "Path to promptfoo HTML report file", "eval_results/index.html")
    .option("--db-file <path>", "Path to promptfoo DB file", "eval_results/.promptfoo/promptfoo.db")
    .option("--router-results-file <path>", "Path to router Promptfoo results JSON file", "eval_results/router-results.json")
    .option("--router-html-file <path>", "Path to router Promptfoo HTML report file", "eval_results/router-index.html")
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
      routerResultsFile: opts.routerResultsFile,
      routerHtmlFile: opts.routerHtmlFile,
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
