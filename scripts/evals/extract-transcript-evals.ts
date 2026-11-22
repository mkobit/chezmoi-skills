import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { Command } from "commander";

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

interface TranscriptStep {
  step_index: number;
  source: string;
  type: string;
  status: string;
  content?: string;
  tool_calls?: Array<{
    name: string;
    args?: Record<string, unknown>;
  }>;
}

const program = new Command();

program
  .name("extract-transcript-evals")
  .description("Extract structured evaluation test cases from transcript JSONL log files")
  .option("-i, --input <path>", "Path to transcript JSONL file or directory containing transcripts")
  .option("-o, --out-dir <dir>", "Directory for output evaluation test cases", "tests/evals")
  .option("-s, --target-skill <skill>", "Target skill name for extracted test cases", "chezmoi-cli-commands")
  .option("-p, --id-prefix <prefix>", "ID prefix for generated test cases", "TC-EXTRACTED")
  .option("--dry-run", "Output extracted test cases to stdout without writing files")
  .parse(process.argv);

const options = program.opts();

const extractUserPromptText = (content: string): string => {
  let text = content;
  const requestMatch = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (requestMatch) {
    text = requestMatch[1];
  }
  text = text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "");
  text = text.replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, "");
  return text.trim();
};

const extractChezmoiCommand = (step: TranscriptStep): string | null => {
  if (!step.tool_calls) return null;
  for (const call of step.tool_calls) {
    if (call.name === "run_command" && call.args) {
      const rawCmd = (call.args.CommandLine || call.args.command_line || "") as string;
      const cleanCmd = rawCmd.replace(/^"|"$/g, "").trim();
      if (cleanCmd.includes("chezmoi")) {
        const match = cleanCmd.match(/(chezmoi\s+[^\&\;\|]+)/);
        if (match) {
          return match[1].trim();
        }
      }
    }
  }
  return null;
};

export const parseTranscript = (jsonlContent: string, targetSkill: string, idPrefix: string): TestCase[] => {
  const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
  const steps: TranscriptStep[] = [];

  for (const line of lines) {
    try {
      steps.push(JSON.parse(line));
    } catch {
      // Ignore invalid JSON lines
    }
  }

  const testCases: TestCase[] = [];
  let count = 1;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === "USER_INPUT" && step.content) {
      const promptText = extractUserPromptText(step.content);
      if (!promptText || promptText.length < 5) continue;
      if (promptText.startsWith("this is the new continu") || promptText.includes("Continuation prompt:")) continue;

      let extractedCmd: string | null = null;
      for (let j = i + 1; j < Math.min(i + 5, steps.length); j++) {
        if (steps[j].type === "USER_INPUT") break;
        const cmd = extractChezmoiCommand(steps[j]);
        if (cmd) {
          extractedCmd = cmd;
          break;
        }
      }

      const id = `${idPrefix}-${String(count).padStart(3, "0")}`;
      count++;

      if (extractedCmd) {
        const flags = extractedCmd.split(/\s+/).filter((arg) => arg.startsWith("-"));
        const tc: TestCase = {
          id,
          name: `Extracted command correctness for ${extractedCmd.split(/\s+/).slice(0, 2).join(" ")}`,
          eval_type: "command_correctness",
          target_skill: targetSkill,
          input: {
            user_prompt: promptText,
          },
          expected: {
            exact_command: extractedCmd,
            command_regex: `^${extractedCmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            required_flags: flags.length > 0 ? flags : undefined,
          },
          token_budget: 500,
        };
        const validation = TestCaseSchema.safeParse(tc);
        if (validation.success) {
          testCases.push(validation.data);
        }
      } else if (promptText.toLowerCase().includes("chezmoi") || promptText.toLowerCase().includes("dotfile")) {
        const tc: TestCase = {
          id,
          name: `Extracted trigger matching for user request`,
          eval_type: "trigger_matching",
          target_skill: targetSkill,
          input: {
            user_prompt: promptText,
          },
          expected: {
            should_trigger: true,
          },
          token_budget: 300,
        };
        const validation = TestCaseSchema.safeParse(tc);
        if (validation.success) {
          testCases.push(validation.data);
        }
      }
    }
  }

  return testCases;
};

const main = async () => {
  const inputPath = options.input;
  if (!inputPath) {
    console.error("Error: --input option is required.");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: File or directory not found at ${inputPath}`);
    process.exit(1);
  }

  const filesToProcess: string[] = [];
  const statInfo = await readdir(inputPath, { withFileTypes: true }).catch(() => null);

  if (statInfo) {
    for (const entry of statInfo) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        filesToProcess.push(join(inputPath, entry.name));
      }
    }
  } else if (inputPath.endsWith(".jsonl")) {
    filesToProcess.push(inputPath);
  }

  if (filesToProcess.length === 0) {
    console.error(`Error: No .jsonl files found in ${inputPath}`);
    process.exit(1);
  }

  const allTestCases: TestCase[] = [];
  for (const filePath of filesToProcess) {
    const rawContent = await readFile(filePath, "utf-8");
    const extracted = parseTranscript(rawContent, options.targetSkill, options.idPrefix);
    allTestCases.push(...extracted);
  }

  console.log(`Extracted ${allTestCases.length} eval test cases from ${filesToProcess.length} transcript file(s).`);

  if (options.dryRun) {
    console.log(JSON.stringify(allTestCases, null, 2));
    return;
  }

  const outDir = options.outDir;
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const outFile = join(outDir, `extracted_evals.json`);
  await writeFile(outFile, JSON.stringify(allTestCases, null, 2));
  console.log(`Saved extracted evals to ${outFile}`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
