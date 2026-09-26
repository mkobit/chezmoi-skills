import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join, relative } from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Command } from "commander";

const program = new Command();

program
  .option("--skill <skill>", "Filter evaluation by target skill")
  .option("--category <category>", "Filter evaluation by eval_type category")
  .option("--evals-dir <dir>", "Directory containing evaluation test suites", "tests/evals")
  .option("--out-dir <dir>", "Directory for static contract results", "eval_results")
  .option("--skills-dir <dir>", "Directory containing skills", "skills")
  .parse(process.argv);

const options = program.opts();

const AnswerQualitySchema = z
  .object({
    required_concepts: z.array(z.string()).min(1).optional(),
    forbidden_claims: z.array(z.string()).min(1).optional(),
    clarification: z.enum(["required", "forbidden"]).optional(),
    safety_expectations: z.array(z.string()).min(1).optional(),
  })
  .refine(
    (expectation) =>
      expectation.required_concepts !== undefined ||
      expectation.forbidden_claims !== undefined ||
      expectation.clarification !== undefined ||
      expectation.safety_expectations !== undefined,
    "Answer quality expectations must include at least one assertion."
  );

const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  eval_type: z.enum(["trigger_matching", "skill_selection", "command_correctness", "answer_quality"]),
  target_skill: z.string(),
  input: z.object({
    user_prompt: z.string(),
    context_files: z.array(z.string()).optional(),
  }),
  expected: z.object({
    should_trigger: z.boolean().optional(),
    selected_skill: z.string().optional(),
    selected_skills: z.array(z.string()).min(1).optional(),
    allow_clarification: z.boolean().optional(),
    exact_command: z.string().optional(),
    command_regex: z.string().optional(),
    required_flags: z.array(z.string()).optional(),
    forbidden_flags: z.array(z.string()).optional(),
    answer_quality: AnswerQualitySchema.optional(),
  }),
  token_budget: z.number().optional(),
});

type TestCase = z.infer<typeof TestCaseSchema>;

interface SkillSource {
  name: string;
  description: string;
  root: string;
  files: string[];
  content: string;
}

interface AssertionResult {
  type: string;
  expected: unknown;
  actual?: unknown;
  passed: boolean;
}

interface TestResult {
  test_id: string;
  name: string;
  eval_type: string;
  contract_type: "static_repository_coverage";
  target_skill: string;
  status: "PASS" | "FAIL";
  latency_ms: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  actual_output: string;
  assertions: AssertionResult[];
}

const PRODUCT_CUE = /\bchezmoi\b|\bdotfiles?\b|\.chezmoi/i;
const STOP_WORDS = new Set([
  "about",
  "after",
  "all",
  "and",
  "apply",
  "can",
  "current",
  "does",
  "dotfile",
  "dotfiles",
  "for",
  "from",
  "how",
  "in",
  "is",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "using",
  "what",
  "when",
  "with",
  "would",
  "you",
]);

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .match(/[a-z][a-z0-9-]*/g)
    ?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) ?? [];

const markdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }

  return files;
};

const loadSkillSources = async (skillsDir: string): Promise<Record<string, SkillSource>> => {
  const skillSources: Record<string, SkillSource> = {};
  if (!existsSync(skillsDir)) return skillSources;

  const directories = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;

    const root = join(skillsDir, directory.name);
    const entrypoint = join(root, "SKILL.md");
    if (!existsSync(entrypoint)) continue;

    const entrypointContent = await readFile(entrypoint, "utf-8");
    const { data } = matter(entrypointContent);
    if (typeof data.name !== "string" || typeof data.description !== "string") continue;

    const files = await markdownFiles(root);
    const contents = await Promise.all(files.map((file) => readFile(file, "utf-8")));
    skillSources[data.name] = {
      name: data.name,
      description: data.description,
      root,
      files,
      content: contents.join("\n"),
    };
  }

  return skillSources;
};

const promptEvidence = (userPrompt: string, source: SkillSource): string[] => {
  const sourceTerms = new Set(tokenize(source.content));
  return [...new Set(tokenize(userPrompt).filter((term) => sourceTerms.has(term)))];
};

const commandEvidence = (testCase: TestCase): string[] => {
  const command = testCase.expected.exact_command;
  const terms = new Set<string>();

  if (command?.startsWith("chezmoi ")) {
    const words = command.slice("chezmoi ".length).split(/\s+/);
    const first = words[0];
    if (first) terms.add(`chezmoi ${first}`);
    if (first === "state" && words[1] && !words[1].startsWith("-")) {
      terms.add(`chezmoi state ${words[1]}`);
    }
  } else if (command?.startsWith("sh -c")) {
    terms.add("get.chezmoi.io");
  } else if (command) {
    const prefix = command.split("_")[0];
    if (prefix && prefix.length >= 3) terms.add(`${prefix}_`);
  }

  for (const flag of testCase.expected.required_flags ?? []) {
    terms.add(flag.replace(/=.*/, ""));
  }

  return [...terms];
};

const evaluateTestCase = (
  testCase: TestCase,
  skillSources: Record<string, SkillSource>,
  skillsDir: string
): TestResult => {
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];
  const source = skillSources[testCase.target_skill];

  assertions.push({
    type: "target_skill_exists",
    expected: testCase.target_skill,
    actual: source?.name,
    passed: source !== undefined,
  });

  if (source) {
    assertions.push({
      type: "skill_entrypoint_exists",
      expected: "SKILL.md",
      actual: source.files.map((file) => relative(source.root, file)),
      passed: source.files.some((file) => file === join(source.root, "SKILL.md")),
    });

    if (testCase.eval_type === "trigger_matching") {
      const shouldTrigger = testCase.expected.should_trigger;
      const hasProductCue = PRODUCT_CUE.test(testCase.input.user_prompt);
      assertions.push({
        type: "trigger_fixture_scope",
        expected: shouldTrigger ? "contains a chezmoi or dotfiles cue" : "omits chezmoi and dotfiles cues",
        actual: hasProductCue,
        passed: shouldTrigger === undefined || hasProductCue === shouldTrigger,
      });
    }

    if (testCase.eval_type === "skill_selection") {
      const evidence = promptEvidence(testCase.input.user_prompt, source);
      assertions.push({
        type: "selection_prompt_source_overlap",
        expected: "at least one non-generic prompt term documented by the target skill",
        actual: evidence,
        passed: evidence.length > 0,
      });
    }

    if (testCase.eval_type === "command_correctness") {
      const evidence = commandEvidence(testCase);
      const missing = evidence.filter((term) => !source.content.includes(term));
      assertions.push({
        type: "command_target_skill_coverage",
        expected: evidence,
        actual: { documented: evidence.filter((term) => !missing.includes(term)), missing },
        passed: evidence.length > 0 && missing.length === 0,
      });
    }

    if (testCase.eval_type === "answer_quality") {
      const expectation = testCase.expected.answer_quality;
      assertions.push({
        type: "answer_quality_expectation_present",
        expected: "at least one deterministic answer quality expectation",
        actual: expectation,
        passed: expectation !== undefined,
      });
    }
  }

  for (const contextFile of testCase.input.context_files ?? []) {
    const path = join(skillsDir, contextFile);
    assertions.push({
      type: `context_file_exists:${contextFile}`,
      expected: contextFile,
      actual: existsSync(path),
      passed: existsSync(path),
    });
  }

  const latency_ms = Date.now() - startTime;
  const allPassed = assertions.length > 0 && assertions.every((assertion) => assertion.passed);
  const output = {
    contract_type: "static_repository_coverage",
    target_skill: testCase.target_skill,
    assertions: assertions.map(({ type, passed }) => ({ type, passed })),
  };

  return {
    test_id: testCase.id,
    name: testCase.name,
    eval_type: testCase.eval_type,
    contract_type: "static_repository_coverage",
    target_skill: testCase.target_skill,
    status: allPassed ? "PASS" : "FAIL",
    latency_ms,
    tokens: {
      // This is the fixture prompt size, not model token usage.
      prompt_tokens: estimateTokens(testCase.input.user_prompt),
      completion_tokens: 0,
    },
    actual_output: JSON.stringify(output),
    assertions,
  };
};

const loadTestCases = async (evalsDir: string): Promise<TestCase[]> => {
  if (!existsSync(evalsDir)) return [];
  const files = await readdir(evalsDir).catch(() => []);
  const testCases: TestCase[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const raw = await readFile(join(evalsDir, file), "utf-8").catch(() => null);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        const result = TestCaseSchema.safeParse(item);
        if (result.success) {
          testCases.push(result.data);
        } else {
          console.warn(`Warning: Invalid test case in ${file}:`, result.error.issues);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}:`, error);
    }
  }

  return testCases;
};

const generateMarkdownSummary = (results: TestResult[], timestamp: string, totalMs: number): string => {
  const total = results.length;
  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = total - passed;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";
  const fixturePromptTokens = results.reduce((sum, result) => sum + result.tokens.prompt_tokens, 0);
  const categories = ["trigger_matching", "skill_selection", "command_correctness", "answer_quality"];
  const categoryRows = categories
    .map((category) => {
      const categoryResults = results.filter((result) => result.eval_type === category);
      if (categoryResults.length === 0) return "";
      const categoryPassed = categoryResults.filter((result) => result.status === "PASS").length;
      const categoryRate = ((categoryPassed / categoryResults.length) * 100).toFixed(1);
      return `| \`${category}\` | ${categoryResults.length} | ${categoryPassed} | ${categoryResults.length - categoryPassed} | ${categoryRate}% |`;
    })
    .filter(Boolean)
    .join("\n");
  const detailRows = results
    .map(
      (result) =>
        `| \`${result.test_id}\` | ${result.name} | \`${result.eval_type}\` | ${result.status} | \`${result.target_skill}\` | ${result.latency_ms}ms |`
    )
    .join("\n");

  return `# Static repository contract summary

These contracts validate the relationship between the curated corpus and the checked-in skill source.
They do not execute a model or claim to measure model routing or command-generation quality.
Use the Promptfoo live evaluation for behavioral results.

- Execution timestamp: \`${timestamp}\`
- Duration: \`${totalMs}ms\`
- Total test cases: \`${total}\`
- Passed: \`${passed}\`
- Failed: \`${failed}\`
- Pass rate: \`${passRate}%\`
- Fixture prompt tokens: \`${fixturePromptTokens.toLocaleString()}\` (not model usage)

## Results by evaluation category

| Category | Total | Passed | Failed | Pass rate |
| --- | --- | --- | --- | --- |
${categoryRows}

## Detailed test case outcomes

| Test ID | Name | Corpus category | Result | Target skill | Static check time |
| --- | --- | --- | --- | --- |
${detailRows}
`;
};

const run = async () => {
  let testCases = await loadTestCases(options.evalsDir);
  if (options.skill) testCases = testCases.filter((testCase) => testCase.target_skill === options.skill);
  if (options.category) testCases = testCases.filter((testCase) => testCase.eval_type === options.category);

  if (testCases.length === 0) {
    console.log("No test cases found matching criteria.");
    return;
  }

  const skillSources = await loadSkillSources(options.skillsDir);
  console.log(`Running ${testCases.length} static repository contracts (not model evaluations)...`);

  const startTime = Date.now();
  const results = testCases.map((testCase) => evaluateTestCase(testCase, skillSources, options.skillsDir));
  const totalMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  if (!existsSync(options.outDir)) await mkdir(options.outDir, { recursive: true });

  const jsonSummary = {
    benchmark_run: {
      timestamp,
      duration_ms: totalMs,
      contract_type: "static_repository_coverage",
      metrics: {
        total_tests: results.length,
        passed: results.filter((result) => result.status === "PASS").length,
        failed: results.filter((result) => result.status === "FAIL").length,
        pass_rate: results.length === 0 ? 0 : results.filter((result) => result.status === "PASS").length / results.length,
        fixture_prompt_tokens: results.reduce((sum, result) => sum + result.tokens.prompt_tokens, 0),
      },
    },
    results,
  };

  await writeFile(join(options.outDir, "results.json"), JSON.stringify(jsonSummary, null, 2));
  await writeFile(join(options.outDir, "summary.md"), generateMarkdownSummary(results, timestamp, totalMs));

  let hasFailures = false;
  for (const result of results) {
    const icon = result.status === "PASS" ? "✅" : "❌";
    console.log(`${icon} [${result.eval_type}] ${result.test_id}: ${result.name}`);
    hasFailures ||= result.status === "FAIL";
  }

  console.log(`Contract results saved to ${options.outDir}/summary.md and ${options.outDir}/results.json`);
  if (hasFailures) process.exit(1);
};

run();
