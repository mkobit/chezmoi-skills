import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { Command } from "commander";
import { TestCaseSchema, type TestCase } from "./corpus.ts";

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

const PRODUCT_CUE = /\bchezmoi\b|\bdotfiles?\b|\.chezmoi/i;

/**
 * Redacts secrets, emails, and raw host home paths from extracted transcript text.
 */
export const sanitizeTranscriptText = (text: string): string =>
  text
    .replace(
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_KEY]")
    .replace(
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}\b/g,
      "[REDACTED_KEY]",
    )
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/g, "[REDACTED_KEY]")
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      "user@example.com",
    )
    .replace(/\/(?:home|Users)\/[^/\s"'`]+/g, "~")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"'`]+/g, "~");

const buildProgram = (): Command =>
  new Command()
    .name("extract-transcript-evals")
    .description(
      "Extract structured evaluation test cases from transcript JSONL log files",
    )
    .option(
      "-i, --input <path>",
      "Path to transcript JSONL file or directory containing transcripts",
    )
    .option(
      "-o, --out-dir <dir>",
      "Directory for output evaluation test cases",
      "tests/evals",
    )
    .option(
      "-s, --target-skill <skill>",
      "Target skill name for extracted test cases",
      "chezmoi-cli-commands",
    )
    .option(
      "-p, --id-prefix <prefix>",
      "ID prefix for generated test cases",
      "TC-EXTRACTED",
    )
    .option(
      "--dry-run",
      "Output extracted test cases to stdout without writing files",
    );

const extractUserPromptText = (content: string): string => {
  let text = content;
  const requestMatch = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (requestMatch?.[1] !== undefined) {
    text = requestMatch[1];
  }
  text = text.replace(
    /<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g,
    "",
  );
  text = text.replace(
    /<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g,
    "",
  );
  return text.trim();
};

const extractChezmoiCommand = (step: TranscriptStep): string | null => {
  if (!step.tool_calls) return null;
  for (const call of step.tool_calls) {
    if (call.name === "run_command" && call.args) {
      const rawCmd = (call.args.CommandLine ||
        call.args.command_line ||
        "") as string;
      const cleanCmd = rawCmd.replace(/^"|"$/g, "").trim();
      if (cleanCmd.includes("chezmoi")) {
        const match = cleanCmd.match(/(chezmoi\s+[^\&\;\|]+)/);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
    }
  }
  return null;
};

export const parseTranscript = (
  jsonlContent: string,
  targetSkill: string,
  idPrefix: string,
  startCount = 1,
): TestCase[] => {
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
  let count = startCount;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step?.type === "USER_INPUT" && step.content) {
      const promptText = sanitizeTranscriptText(
        extractUserPromptText(step.content),
      );
      if (!promptText || promptText.length < 5) continue;
      if (
        promptText.startsWith("this is the new continu") ||
        promptText.includes("Continuation prompt:")
      )
        continue;

      let extractedCmd: string | null = null;
      for (let j = i + 1; j < Math.min(i + 5, steps.length); j++) {
        const nextStep = steps[j];
        if (!nextStep || nextStep.type === "USER_INPUT") break;
        const cmd = extractChezmoiCommand(nextStep);
        if (cmd) {
          extractedCmd = sanitizeTranscriptText(cmd);
          break;
        }
      }

      if (extractedCmd) {
        const id = `${idPrefix}-${String(count).padStart(3, "0")}`;
        count++;
        const flags = extractedCmd
          .split(/\s+/)
          .filter((arg) => arg.startsWith("-"));
        const tc: TestCase = {
          id,
          name: `Extracted command correctness for ${extractedCmd.split(/\s+/).slice(0, 2).join(" ")}`,
          eval_type: "command_correctness",
          target_skill: targetSkill,
          origin: "distilled",
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
      } else if (PRODUCT_CUE.test(promptText)) {
        const id = `${idPrefix}-${String(count).padStart(3, "0")}`;
        count++;
        const tc: TestCase = {
          id,
          name: "Extracted trigger matching for user request",
          eval_type: "trigger_matching",
          target_skill: targetSkill,
          origin: "distilled",
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

export const extractTranscriptEvals = async (
  argv: string[] = process.argv,
): Promise<number> => {
  const program = buildProgram();
  program.parse(argv);
  const options = program.opts<{
    input?: string;
    outDir: string;
    targetSkill: string;
    idPrefix: string;
    dryRun?: boolean;
  }>();

  const inputPath = options.input;
  if (!inputPath) {
    console.error("Error: --input option is required.");
    return 1;
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: File or directory not found at ${inputPath}`);
    return 1;
  }

  const filesToProcess: string[] = [];
  const statInfo = await readdir(inputPath, { withFileTypes: true }).catch(
    () => null,
  );

  if (statInfo) {
    for (const entry of statInfo) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        filesToProcess.push(join(inputPath, entry.name));
      }
    }
    filesToProcess.sort();
  } else if (inputPath.endsWith(".jsonl")) {
    filesToProcess.push(inputPath);
  }

  if (filesToProcess.length === 0) {
    console.error(`Error: No .jsonl files found in ${inputPath}`);
    return 1;
  }

  const allTestCases: TestCase[] = [];
  for (const filePath of filesToProcess) {
    const rawContent = await readFile(filePath, "utf-8");
    const extracted = parseTranscript(
      rawContent,
      options.targetSkill,
      options.idPrefix,
      allTestCases.length + 1,
    );
    allTestCases.push(...extracted);
  }

  console.log(
    `Extracted ${allTestCases.length} eval test cases from ${filesToProcess.length} transcript file(s).`,
  );

  if (options.dryRun) {
    console.log(JSON.stringify(allTestCases, null, 2));
    return 0;
  }

  const outDir = options.outDir;
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const outFile = join(outDir, "extracted_evals.json");
  await writeFile(outFile, JSON.stringify(allTestCases, null, 2));
  console.log(`Saved extracted evals to ${outFile}`);
  return 0;
};

if (import.meta.main) {
  const code = await extractTranscriptEvals(process.argv);
  process.exit(code);
}
