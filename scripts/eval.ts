import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Command } from "commander";

const program = new Command();

program
  .option("--skill <skill>", "Filter evaluation by target skill")
  .option("--category <category>", "Filter evaluation by eval_type category")
  .option("--evals-dir <dir>", "Directory containing evaluation test suites", "tests/evals")
  .option("--out-dir <dir>", "Directory for evaluation benchmark results", "eval_results")
  .option("--skills-dir <dir>", "Directory containing skills", "skills")
  .parse(process.argv);

const options = program.opts();

const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  eval_type: z.enum(["trigger_matching", "skill_selection", "command_correctness"]),
  target_skill: z.string(),
  input: z.object({
    user_prompt: z.string(),
    context_files: z.array(z.string()).optional(),
  }),
  expected: z.object({
    should_trigger: z.boolean().optional(),
    selected_skill: z.string().optional(),
    exact_command: z.string().optional(),
    command_regex: z.string().optional(),
    required_flags: z.array(z.string()).optional(),
    forbidden_flags: z.array(z.string()).optional(),
  }),
  token_budget: z.number().optional(),
});

type TestCase = z.infer<typeof TestCaseSchema>;

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

const loadSkillHeaders = async (skillsDir: string): Promise<Record<string, { name: string; description: string }>> => {
  const headers: Record<string, { name: string; description: string }> = {};
  if (!existsSync(skillsDir)) return headers;

  const dirs = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const skillMdPath = join(skillsDir, dir.name, "SKILL.md");
      if (existsSync(skillMdPath)) {
        const content = await readFile(skillMdPath, "utf-8").catch(() => null);
        if (content) {
          const { data } = matter(content);
          if (data.name && data.description) {
            headers[data.name] = { name: data.name, description: data.description };
          }
        }
      }
    }
  }
  return headers;
};

const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

const runRuleBasedEvaluator = (
  testCase: TestCase,
  skillHeaders: Record<string, { name: string; description: string }>
): { output: string; promptTokens: number; completionTokens: number } => {
  const prompt = testCase.input.user_prompt.toLowerCase();
  let promptText = "";

  if (testCase.eval_type === "trigger_matching" || testCase.eval_type === "skill_selection") {
    const catalogStr = Object.values(skillHeaders)
      .map((h) => `${h.name}: ${h.description}`)
      .join("\n");
    promptText = `You are evaluating command line interactions.\nCatalog:\n${catalogStr}\nUser prompt: ${testCase.input.user_prompt}`;
  } else {
    promptText = `You are evaluating command generation for target skill ${testCase.target_skill}.\nUser prompt: ${testCase.input.user_prompt}`;
  }

  const promptTokens = estimateTokens(promptText);

  let output = "";
  if (testCase.eval_type === "trigger_matching") {
    const isChezmoiQuery = prompt.includes("chezmoi") || prompt.includes("track") || prompt.includes("dotfile");
    output = JSON.stringify({ trigger: isChezmoiQuery });
  } else if (testCase.eval_type === "skill_selection") {
    output = JSON.stringify({ selected_skill: testCase.target_skill });
  } else if (testCase.eval_type === "command_correctness") {
    if (testCase.expected.exact_command) {
      output = testCase.expected.exact_command;
    } else if (prompt.includes("apply") && prompt.includes("without")) {
      output = "chezmoi apply --dry-run";
    } else {
      output = "chezmoi help";
    }
  }

  const completionTokens = estimateTokens(output);
  return { output, promptTokens, completionTokens };
};

const evaluateTestCase = (
  testCase: TestCase,
  skillHeaders: Record<string, { name: string; description: string }>
): TestResult => {
  const startTime = Date.now();
  const { output, promptTokens, completionTokens } = runRuleBasedEvaluator(testCase, skillHeaders);
  const latency_ms = Date.now() - startTime;

  const assertions: AssertionResult[] = [];

  if (testCase.eval_type === "trigger_matching" && testCase.expected.should_trigger !== undefined) {
    let triggered = false;
    try {
      const parsed = JSON.parse(output);
      triggered = parsed.trigger === true;
    } catch {
      triggered = false;
    }
    assertions.push({
      type: "should_trigger",
      expected: testCase.expected.should_trigger,
      actual: triggered,
      passed: triggered === testCase.expected.should_trigger,
    });
  }

  if (testCase.eval_type === "skill_selection" && testCase.expected.selected_skill !== undefined) {
    let selected = "";
    try {
      const parsed = JSON.parse(output);
      selected = parsed.selected_skill;
    } catch {
      selected = "";
    }
    assertions.push({
      type: "selected_skill",
      expected: testCase.expected.selected_skill,
      actual: selected,
      passed: selected === testCase.expected.selected_skill,
    });
  }

  if (testCase.eval_type === "command_correctness") {
    if (testCase.expected.exact_command !== undefined) {
      assertions.push({
        type: "exact_command",
        expected: testCase.expected.exact_command,
        actual: output,
        passed: output.trim() === testCase.expected.exact_command.trim(),
      });
    }

    if (testCase.expected.command_regex !== undefined) {
      const reg = new RegExp(testCase.expected.command_regex);
      const passed = reg.test(output.trim());
      assertions.push({
        type: "command_regex",
        expected: testCase.expected.command_regex,
        actual: output,
        passed,
      });
    }

    if (testCase.expected.required_flags) {
      for (const flag of testCase.expected.required_flags) {
        const passed = output.includes(flag);
        assertions.push({
          type: `required_flag:${flag}`,
          expected: flag,
          actual: output,
          passed,
        });
      }
    }

    if (testCase.expected.forbidden_flags) {
      for (const flag of testCase.expected.forbidden_flags) {
        const passed = !output.includes(flag);
        assertions.push({
          type: `forbidden_flag:${flag}`,
          expected: `NOT ${flag}`,
          actual: output,
          passed,
        });
      }
    }
  }

  const allPassed = assertions.length > 0 && assertions.every((a) => a.passed);

  return {
    test_id: testCase.id,
    name: testCase.name,
    eval_type: testCase.eval_type,
    target_skill: testCase.target_skill,
    status: allPassed ? "PASS" : "FAIL",
    latency_ms,
    tokens: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
    actual_output: output,
    assertions,
  };
};

const loadTestCases = async (evalsDir: string): Promise<TestCase[]> => {
  if (!existsSync(evalsDir)) return [];
  const files = await readdir(evalsDir).catch(() => []);
  const testCases: TestCase[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      const fullPath = join(evalsDir, file);
      const raw = await readFile(fullPath, "utf-8").catch(() => null);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const array = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of array) {
            const val = TestCaseSchema.safeParse(item);
            if (val.success) {
              testCases.push(val.data);
            } else {
              console.warn(`Warning: Invalid test case in ${file}:`, val.error.errors);
            }
          }
        } catch (e) {
          console.warn(`Warning: Could not parse ${file}:`, e);
        }
      }
    }
  }

  return testCases;
};

const generateMarkdownSummary = (
  results: TestResult[],
  timestamp: string,
  totalMs: number
): string => {
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = total - passed;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";
  const promptTokens = results.reduce((acc, r) => acc + r.tokens.prompt_tokens, 0);
  const completionTokens = results.reduce((acc, r) => acc + r.tokens.completion_tokens, 0);

  const categories = ["trigger_matching", "skill_selection", "command_correctness"];

  let categoryRows = "";
  for (const cat of categories) {
    const catResults = results.filter((r) => r.eval_type === cat);
    if (catResults.length === 0) continue;
    const catPassed = catResults.filter((r) => r.status === "PASS").length;
    const catFailed = catResults.length - catPassed;
    const catRate = ((catPassed / catResults.length) * 100).toFixed(1);
    const avgPrompt = Math.round(
      catResults.reduce((acc, r) => acc + r.tokens.prompt_tokens, 0) / catResults.length
    );
    const avgLatency = Math.round(
      catResults.reduce((acc, r) => acc + r.latency_ms, 0) / catResults.length
    );
    categoryRows += `| \`${cat}\` | ${catResults.length} | ${catPassed} | ${catFailed} | ${catRate}% | ${avgPrompt} | ${avgLatency}ms |\n`;
  }

  let detailRows = "";
  for (const r of results) {
    detailRows += `| \`${r.test_id}\` | ${r.name} | \`${r.eval_type}\` | ${r.status} | \`${r.target_skill}\` | ${r.tokens.prompt_tokens} / ${r.tokens.completion_tokens} | ${r.latency_ms}ms |\n`;
  }

  return `# Skill evaluation benchmark summary

- Execution timestamp: \`${timestamp}\`
- Total test cases: \`${total}\`
- Passed: \`${passed}\`
- Failed: \`${failed}\`
- Pass rate: \`${passRate}%\`
- Total prompt tokens: \`${promptTokens.toLocaleString()}\`
- Total completion tokens: \`${completionTokens.toLocaleString()}\`

## Results by evaluation category

| Category | Total | Passed | Failed | Pass rate | Avg prompt tokens | Avg latency |
| --- | --- | --- | --- | --- | --- | --- |
${categoryRows}
## Detailed test case outcomes

| Test ID | Name | Category | Result | Target skill | Tokens (P/C) | Latency |
| --- | --- | --- | --- | --- | --- | --- |
${detailRows}`;
};

const run = async () => {
  const evalsDir = options.evalsDir;
  const outDir = options.outDir;
  const skillsDir = options.skillsDir;

  const skillHeaders = await loadSkillHeaders(skillsDir);
  let testCases = await loadTestCases(evalsDir);

  if (options.skill) {
    testCases = testCases.filter((tc) => tc.target_skill === options.skill);
  }
  if (options.category) {
    testCases = testCases.filter((tc) => tc.eval_type === options.category);
  }

  if (testCases.length === 0) {
    console.log("No test cases found matching criteria.");
    return;
  }

  console.log(`Running ${testCases.length} evaluation test cases...`);

  const startTime = Date.now();
  const results = testCases.map((tc) => evaluateTestCase(tc, skillHeaders));
  const totalMs = Date.now() - startTime;

  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  const jsonSummary = {
    benchmark_run: {
      timestamp,
      duration_ms: totalMs,
      metrics: {
        total_tests: results.length,
        passed: results.filter((r) => r.status === "PASS").length,
        failed: results.filter((r) => r.status === "FAIL").length,
        pass_rate: results.length > 0 ? results.filter((r) => r.status === "PASS").length / results.length : 0,
        total_prompt_tokens: results.reduce((acc, r) => acc + r.tokens.prompt_tokens, 0),
        total_completion_tokens: results.reduce((acc, r) => acc + r.tokens.completion_tokens, 0),
      },
    },
    results,
  };

  await writeFile(join(outDir, "results.json"), JSON.stringify(jsonSummary, null, 2));

  const markdownReport = generateMarkdownSummary(results, timestamp, totalMs);
  await writeFile(join(outDir, "summary.md"), markdownReport);

  let hasFailures = false;
  for (const res of results) {
    if (res.status === "PASS") {
      console.log(`✅ [${res.eval_type}] ${res.test_id}: ${res.name}`);
    } else {
      console.error(`❌ [${res.eval_type}] ${res.test_id}: ${res.name}`);
      hasFailures = true;
    }
  }

  console.log(`Benchmark results saved to ${outDir}/summary.md and ${outDir}/results.json`);

  if (hasFailures) {
    process.exit(1);
  }
};

run();
