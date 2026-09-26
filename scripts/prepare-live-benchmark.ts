import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { Command } from "commander";

interface CorpusCase {
  eval_type: string;
}

export interface LiveBenchmarkPreflight {
  schema_version: 1;
  source_of_truth: "tests/evals/*.json";
  commit_sha: string | null;
  promptfoo_version: string;
  skill_source_sha256: string;
  evaluation_code_sha256: string;
  dependency_lock_sha256: string;
  corpus: {
    files: number;
    cases: number;
    answer_cases: number;
    router_cases: number;
    sha256: string;
  };
  generated_inputs: Record<string, string>;
  answer_suite: {
    prompts: number;
    providers: string[];
    planned_requests: number;
  };
  router_suite: {
    prompts: number;
    providers: string[];
    planned_requests: number;
  };
  total_planned_requests: number;
}

const sha256 = (content: string): string => createHash("sha256").update(content).digest("hex");

const fileSha256 = (path: string): string => sha256(readFileSync(path));

const listedFiles = (directory: string, suffix: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(directory, entry.name))
    .sort();

const listedFilesRecursive = (directory: string, suffix: string): string[] =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listedFilesRecursive(path, suffix) : entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
    })
    .sort();

const corpusHash = (files: string[], rootDir: string): string => {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(rootDir, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const yamlValues = (content: string, key: string): string[] => {
  const values: string[] = [];
  const pattern = new RegExp(`^\\s*-\\s+${key}:\\s*(.+?)\\s*$`, "gm");
  for (const match of content.matchAll(pattern)) {
    const value = match[1].trim();
    values.push(value.replace(/^['"]|['"]$/g, ""));
  }
  return values;
};

const readRequired = (path: string): string => {
  if (!existsSync(path)) throw new Error(`Required generated input not found: ${path}`);
  return readFileSync(path, "utf-8");
};

export const prepareLiveBenchmark = (rootDir = "."): LiveBenchmarkPreflight => {
  const root = resolve(rootDir);
  const evalsDir = join(root, "tests", "evals");
  const generatedDir = join(root, "eval_results");
  const corpusFiles = listedFiles(evalsDir, ".json");
  if (corpusFiles.length === 0) throw new Error(`No JSON corpus files found in ${evalsDir}`);

  const cases = corpusFiles.flatMap((file) => {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries as CorpusCase[];
  });
  const answerCases = cases.filter(
    (testCase) => testCase.eval_type === "command_correctness" || testCase.eval_type === "answer_quality"
  ).length;
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
    devDependencies?: Record<string, string>;
  };
  const promptfooVersion = packageJson.devDependencies?.promptfoo;
  if (promptfooVersion !== "0.123.1") {
    throw new Error(`Expected promptfoo 0.123.1, found ${promptfooVersion ?? "no pinned version"}`);
  }
  const skillFiles = listedFilesRecursive(join(root, "skills"), ".md");
  const evaluationCodeFiles = [
    join(root, "scripts", "eval-assertions.cjs"),
    join(root, "scripts", "generate-promptfoo-evals.ts"),
    join(root, "scripts", "patch-version.cjs"),
  ];
  const answerConfigPath = join(root, "promptfooconfig.yaml");
  const routerConfigPath = join(generatedDir, "promptfooconfig.router.generated.yaml");
  const answerTestsPath = join(generatedDir, "promptfoo-answer-tests.generated.yaml");
  const routerTestsPath = join(generatedDir, "promptfoo-router-tests.generated.yaml");
  const answerConfig = readRequired(answerConfigPath);
  const routerConfig = readRequired(routerConfigPath);
  const answerTests = readRequired(answerTestsPath);
  const routerTests = readRequired(routerTestsPath);
  const countGeneratedTests = (content: string): number => content.match(/^  - description:/gm)?.length ?? 0;
  if (countGeneratedTests(answerTests) !== answerCases || countGeneratedTests(routerTests) !== cases.length) {
    throw new Error("Generated Promptfoo test counts do not match the checked-in corpus");
  }
  if (!answerConfig.includes("tests: file://eval_results/promptfoo-answer-tests.generated.yaml")) {
    throw new Error("Answer configuration does not reference the generated answer tests");
  }
  if (!routerConfig.includes("tests: file://promptfoo-router-tests.generated.yaml")) {
    throw new Error("Router configuration does not reference the generated router tests");
  }
  const answerProviders = yamlValues(answerConfig, "id");
  const routerProviders = yamlValues(routerConfig, "id");
  const answerPrompts = yamlValues(answerConfig, "label").length;
  const routerPrompts = yamlValues(routerConfig, "label").length;
  if (answerProviders.length === 0 || answerPrompts === 0 || routerProviders.length === 0 || routerPrompts === 0) {
    throw new Error("Promptfoo configurations must declare at least one prompt and provider");
  }

  const generatedInputs = {
    "promptfooconfig.yaml": fileSha256(answerConfigPath),
    "eval_results/promptfooconfig.router.generated.yaml": fileSha256(routerConfigPath),
    "eval_results/promptfoo-answer-tests.generated.yaml": fileSha256(answerTestsPath),
    "eval_results/promptfoo-router-tests.generated.yaml": fileSha256(routerTestsPath),
  };
  const answerRequests = answerCases * answerPrompts * answerProviders.length;
  const routerRequests = cases.length * routerPrompts * routerProviders.length;
  return {
    schema_version: 1,
    source_of_truth: "tests/evals/*.json",
    commit_sha: process.env.GITHUB_SHA ?? null,
    promptfoo_version: promptfooVersion,
    skill_source_sha256: corpusHash(skillFiles, root),
    evaluation_code_sha256: corpusHash(evaluationCodeFiles, root),
    dependency_lock_sha256: fileSha256(join(root, "bun.lock")),
    corpus: {
      files: corpusFiles.length,
      cases: cases.length,
      answer_cases: answerCases,
      router_cases: cases.length,
      sha256: corpusHash(corpusFiles, root),
    },
    generated_inputs: generatedInputs,
    answer_suite: {
      prompts: answerPrompts,
      providers: answerProviders,
      planned_requests: answerRequests,
    },
    router_suite: {
      prompts: routerPrompts,
      providers: routerProviders,
      planned_requests: routerRequests,
    },
    total_planned_requests: answerRequests + routerRequests,
  };
};

export const writeLiveBenchmarkPreflight = (outputFile: string, rootDir = "."): LiveBenchmarkPreflight => {
  const result = prepareLiveBenchmark(rootDir);
  mkdirSync(dirname(resolve(outputFile)), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);
  return result;
};

if (import.meta.main) {
  const program = new Command()
    .option("--root-dir <dir>", "Repository root", ".")
    .option("--output-file <path>", "Preflight JSON output", "eval_results/live-preflight.json")
    .parse(process.argv);
  const options = program.opts<{ rootDir: string; outputFile: string }>();
  try {
    const result = writeLiveBenchmarkPreflight(options.outputFile, options.rootDir);
    console.log(`Planned ${result.total_planned_requests} model requests across ${result.corpus.cases} corpus cases.`);
    console.log(`Corpus SHA-256: ${result.corpus.sha256}`);
  } catch (error) {
    console.error(`Live benchmark preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
