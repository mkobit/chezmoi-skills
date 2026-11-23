import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../scripts/evals/cli";
import { filterCases, loadCorpus } from "../scripts/evals/corpus";
import {
  extractTranscriptEvals,
  parseTranscript,
  sanitizeTranscriptText,
} from "../scripts/evals/extract-transcript-evals";
import { validateSecurityLint } from "../scripts/skills/validate/security-lint";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("extract-transcript-evals", () => {
  it("extracts command_correctness test case when a chezmoi command is run", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content:
          "<USER_REQUEST>How do I view pending changes with chezmoi diff?</USER_REQUEST>",
      }),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        tool_calls: [
          {
            name: "run_command",
            args: {
              CommandLine: "chezmoi diff --exclude scripts",
            },
          },
        ],
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(1);
    const firstCase = cases[0];
    if (!firstCase) throw new Error("Expected 1 test case");
    expect(firstCase.id).toBe("TC-TEST-001");
    expect(firstCase.origin).toBe("distilled");
    expect(firstCase.eval_type).toBe("command_correctness");
    expect(firstCase.expected.exact_command).toBe(
      "chezmoi diff --exclude scripts",
    );
    expect(firstCase.expected.required_flags).toEqual(["--exclude"]);
  });

  it("extracts trigger_matching test case when prompt mentions chezmoi but no command is run", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content:
          "<USER_REQUEST>What is the best way to organize chezmoi dotfiles?</USER_REQUEST>",
      }),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        content: "Here is a guide to organizing your dotfiles...",
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(1);
    const firstCase = cases[0];
    if (!firstCase) throw new Error("Expected 1 test case");
    expect(firstCase.id).toBe("TC-TEST-001");
    expect(firstCase.origin).toBe("distilled");
    expect(firstCase.eval_type).toBe("trigger_matching");
    expect(firstCase.expected.should_trigger).toBe(true);
  });

  it("ignores non-chezmoi user requests", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content: "<USER_REQUEST>What is the capital of France?</USER_REQUEST>",
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(0);
  });

  it("sanitizes raw host paths, emails, and secrets from extracted prompts and commands", () => {
    const fakeGithubToken = `ghp_${"a".repeat(24)}`;
    const fakeAwsKey = `AKIA${"1".repeat(16)}`;
    const fakeAgeKey = `AGE-SECRET-KEY-1${"A".repeat(58)}`;
    const raw = [
      "Add /home/alice/.bashrc and /Users/bob/.zshrc and C:\\Users\\carol\\.config",
      `for alice.smith@company.org with ${fakeGithubToken} ${fakeAwsKey} ${fakeAgeKey}`,
    ].join(" ");

    const sanitized = sanitizeTranscriptText(raw);
    expect(sanitized).not.toContain("/home/alice");
    expect(sanitized).not.toContain("/Users/bob");
    expect(sanitized).not.toContain("C:\\Users\\carol");
    expect(sanitized).not.toContain("alice.smith@company.org");
    expect(sanitized).not.toContain(fakeGithubToken);
    expect(sanitized).not.toContain(fakeAwsKey);
    expect(sanitized).not.toContain(fakeAgeKey);
    expect(sanitized).toContain("~/.bashrc");
    expect(sanitized).toContain("~/.zshrc");
    expect(sanitized).toContain("user@example.com");
  });

  it("writes schema-valid, lint-clean distilled cases loadable by the eval CLI", async () => {
    const root = makeTempDir("chezmoi-extract-e2e-");
    const logsDir = join(root, "logs");
    const evalsDir = join(root, "evals");
    mkdirSync(logsDir, { recursive: true });

    const fakeToken = `ghp_${"b".repeat(24)}`;
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content: `<USER_REQUEST>Add /home/alice/.bashrc to chezmoi (token ${fakeToken})</USER_REQUEST>`,
      }),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        tool_calls: [
          {
            name: "run_command",
            args: {
              CommandLine: "chezmoi add /home/alice/.bashrc",
            },
          },
        ],
      }),
    ].join("\n");
    writeFileSync(join(logsDir, "session-1.jsonl"), jsonl, "utf-8");

    const extractExit = await extractTranscriptEvals([
      "bun",
      "extract-transcript-evals.ts",
      "--input",
      logsDir,
      "--out-dir",
      evalsDir,
      "--target-skill",
      "chezmoi-cli-commands",
      "--id-prefix",
      "TC-DISTILLED",
    ]);
    expect(extractExit).toBe(0);

    const { cases } = await loadCorpus(evalsDir);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.origin).toBe("distilled");
    expect(cases[0]?.expected.exact_command).toBe("chezmoi add ~/.bashrc");
    expect(cases[0]?.input.user_prompt).not.toContain(fakeToken);
    expect(cases[0]?.input.user_prompt).not.toContain("/home/alice");

    expect(filterCases(cases, { origin: "distilled" })).toHaveLength(1);
    expect(filterCases(cases, { origin: "contrived" })).toHaveLength(0);

    const lintResults = await validateSecurityLint(".claude-plugin", evalsDir);
    const failedLint = lintResults.filter((r) => !r.valid);
    expect(failedLint).toEqual([]);

    const validateExit = await runCli([
      "bun",
      "cli.ts",
      "validate",
      "--evals-dir",
      evalsDir,
    ]);
    expect(validateExit).toBe(0);

    const dryRunExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--evals-dir",
      evalsDir,
      "--origin",
      "distilled",
      "--dry-run",
    ]);
    expect(dryRunExit).toBe(0);
  });
});
