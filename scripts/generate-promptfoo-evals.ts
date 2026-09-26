import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { Command } from "commander";
import { z } from "zod";

const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  eval_type: z.enum(["trigger_matching", "skill_selection", "command_correctness"]),
  target_skill: z.string(),
  input: z.object({
    user_prompt: z.string(),
  }),
  expected: z.object({
    should_trigger: z.boolean().optional(),
    selected_skill: z.string().optional(),
    exact_command: z.string().optional(),
    command_regex: z.string().optional(),
    required_flags: z.array(z.string()).optional(),
    forbidden_flags: z.array(z.string()).optional(),
  }),
});

export type EvaluationCase = z.infer<typeof TestCaseSchema>;

interface SkillReference {
  file: string;
  content: string;
}

interface SkillSource {
  entrypoint: SkillReference;
  references: SkillReference[];
}

export interface GenerationSummary {
  total_cases: number;
  answer_cases: number;
  router_cases: number;
  skills: string[];
}

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

const yamlString = (value: string): string => JSON.stringify(value);

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

const loadCases = async (evalsDir: string): Promise<EvaluationCase[]> => {
  const files = (await readdir(evalsDir)).filter((file) => file.endsWith(".json")).sort();
  const cases: EvaluationCase[] = [];

  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(join(evalsDir, file), "utf-8"));
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      cases.push(TestCaseSchema.parse(item));
    }
  }

  return cases;
};

const loadSkillSources = async (skillsDir: string): Promise<Record<string, SkillSource>> => {
  const directories = await readdir(skillsDir, { withFileTypes: true });
  const skills: Record<string, SkillSource> = {};

  for (const directory of directories) {
    if (!directory.isDirectory()) continue;

    const root = join(skillsDir, directory.name);
    const entrypointFile = join(root, "SKILL.md");
    if (!existsSync(entrypointFile)) continue;

    const entrypointContent = await readFile(entrypointFile, "utf-8");
    const { data } = matter(entrypointContent);
    if (typeof data.name !== "string" || data.name !== directory.name) continue;

    const references = await Promise.all(
      (await markdownFiles(join(root, "references"))).map(async (file) => ({
        file,
        content: await readFile(file, "utf-8"),
      }))
    );
    skills[data.name] = {
      entrypoint: { file: entrypointFile, content: entrypointContent },
      references,
    };
  }

  return skills;
};

const selectReference = (testCase: EvaluationCase, skill: SkillSource): SkillReference => {
  const selectionTerms = new Set(
    tokenize(
      [
        testCase.input.user_prompt,
        testCase.expected.exact_command,
        ...(testCase.expected.required_flags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
    )
  );
  const commandName = testCase.expected.exact_command?.match(/^chezmoi\s+([a-z-]+)/)?.[1];
  const ranked = skill.references
    .map((reference) => ({
      reference,
      score:
        [...new Set(tokenize(reference.content))].filter((term) => selectionTerms.has(term)).length +
        (commandName && reference.file.endsWith(`/${commandName}.md`) ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.reference.file.localeCompare(right.reference.file));

  return ranked[0]?.reference ?? skill.entrypoint;
};

const metadata = (testCase: EvaluationCase): string => `    metadata:
      corpus_id: ${yamlString(testCase.id)}
      eval_type: ${yamlString(testCase.eval_type)}
      target_skill: ${yamlString(testCase.target_skill)}`;

const vars = (testCase: EvaluationCase, skill: SkillSource): string => `    vars:
      user_prompt: ${yamlString(testCase.input.user_prompt)}
      target_skill: ${yamlString(testCase.target_skill)}
      skill_context: ${yamlString(skill.entrypoint.content)}
      reference_context: ${yamlString(selectReference(testCase, skill).content)}`;

const routerVars = (testCase: EvaluationCase): string => `    vars:
      user_prompt: ${yamlString(testCase.input.user_prompt)}
      target_skill: ${yamlString(testCase.target_skill)}`;

const answerAssertions = (testCase: EvaluationCase): string[] => {
  const assertions: string[] = [];
  if (testCase.expected.exact_command) {
    assertions.push(`      - type: contains\n        value: ${yamlString(testCase.expected.exact_command)}`);
  }
  if (testCase.expected.command_regex) {
    assertions.push(`      - type: javascript
        value: file://scripts/eval-assertions.cjs:commandMatches
        config:
          pattern: ${yamlString(testCase.expected.command_regex)}`);
  }
  for (const flag of testCase.expected.required_flags ?? []) {
    assertions.push(`      - type: icontains\n        value: ${yamlString(flag)}`);
  }
  for (const flag of testCase.expected.forbidden_flags ?? []) {
    assertions.push(`      - type: not-icontains\n        value: ${yamlString(flag)}`);
  }
  return assertions;
};

const answerTest = (testCase: EvaluationCase, skill: SkillSource): string => `  - description: ${yamlString(`[${testCase.id}] ${testCase.name}`)}
${metadata(testCase)}
${vars(testCase, skill)}
    assert:
${answerAssertions(testCase).join("\n")}`;

const routerAssertions = (testCase: EvaluationCase): string[] => {
  const shouldTrigger = testCase.expected.should_trigger ?? true;
  const selectedSkill = shouldTrigger ? testCase.expected.selected_skill ?? testCase.target_skill : null;
  return [
    `      - type: javascript
        value: file://../scripts/eval-assertions.cjs:routerMatches
        config:
          trigger: ${shouldTrigger}
          selectedSkill: ${selectedSkill === null ? "null" : yamlString(selectedSkill)}`,
  ];
};

const routerTest = (testCase: EvaluationCase): string => `  - description: ${yamlString(`[${testCase.id}] ${testCase.name}`)}
${metadata(testCase)}
${routerVars(testCase)}
    assert:
${routerAssertions(testCase).join("\n")}`;

const routerConfig = `# Generated by scripts/generate-promptfoo-evals.ts. Do not edit.
# Structural validation without provider calls: promptfoo validate config --config eval_results/promptfooconfig.router.generated.yaml
description: Chezmoi skill routing evaluation derived from tests/evals/*.json

outputPath: eval_results/router-results.json

prompts:
  - label: skill router
    raw: "System: Route the request using the installed chezmoi skills. Return only JSON with keys trigger (boolean) and selected_skill (skill name or null).\\nAvailable skills: chezmoi-cli-commands, chezmoi-configuration, chezmoi-externals, chezmoi-file-attributes, chezmoi-init, chezmoi-machine-config, chezmoi-scripts, chezmoi-secrets-management, chezmoi-templating.\\nUser: {{user_prompt}}"

providers:
  - id: google:gemini-3.8-flash
    config:
      temperature: 0
  - id: anthropic:messages:claude-sonnet-4-6
    config:
      temperature: 0

tests: file://promptfoo-router-tests.generated.yaml
`;

export const generatePromptfooEvals = async (options: {
  evalsDir?: string;
  skillsDir?: string;
  outDir?: string;
} = {}): Promise<GenerationSummary> => {
  const evalsDir = options.evalsDir ?? "tests/evals";
  const skillsDir = options.skillsDir ?? "skills";
  const outDir = options.outDir ?? "eval_results";
  const [cases, skills] = await Promise.all([loadCases(evalsDir), loadSkillSources(skillsDir)]);
  const missingSkills = [...new Set(cases.map((testCase) => testCase.target_skill))].filter((skill) => !skills[skill]);
  if (missingSkills.length > 0) {
    throw new Error(`Corpus targets missing skill directories: ${missingSkills.join(", ")}`);
  }

  const answerCases = cases.filter((testCase) => testCase.eval_type === "command_correctness");
  const answerTests = answerCases.map((testCase) => answerTest(testCase, skills[testCase.target_skill])).join("\n\n");
  const routerTests = cases.map((testCase) => routerTest(testCase)).join("\n\n");
  const summary: GenerationSummary = {
    total_cases: cases.length,
    answer_cases: answerCases.length,
    router_cases: cases.length,
    skills: Object.keys(skills).sort(),
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, "promptfoo-answer-tests.generated.yaml"), `${answerTests}\n`),
    writeFile(join(outDir, "promptfoo-router-tests.generated.yaml"), `${routerTests}\n`),
    writeFile(join(outDir, "promptfooconfig.router.generated.yaml"), routerConfig),
    writeFile(join(outDir, "promptfoo-evals.manifest.json"), `${JSON.stringify(summary, null, 2)}\n`),
  ]);

  return summary;
};

if (import.meta.main) {
  const program = new Command();
  program
    .option("--evals-dir <dir>", "Directory containing the checked-in corpus", "tests/evals")
    .option("--skills-dir <dir>", "Directory containing skills", "skills")
    .option("--out-dir <dir>", "Directory for generated Promptfoo inputs", "eval_results")
    .parse(process.argv);

  const summary = await generatePromptfooEvals(program.opts());
  console.log(
    `Generated ${summary.answer_cases} answer tests and ${summary.router_cases} router tests from ${summary.total_cases} corpus cases across ${summary.skills.length} skills.`
  );
}
