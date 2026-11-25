import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../scripts/evals/cli.ts";
import type { TestCase } from "../scripts/evals/corpus.ts";
import {
  buildRunSummary,
  compareAgainstBaseline,
  generateChezmoiShimScript,
  loadBaselineSummary,
  parseAgyTrace,
  parseCodexTrace,
  prepareCaseWorkspace,
} from "../scripts/evals/runner.ts";

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

describe("parseCodexTrace", () => {
  it("extracts skills, references, commands, final response, and usage from codex JSONL", () => {
    const rawJsonl = [
      JSON.stringify({
        type: "thread.started",
        thread_id: "thread-1",
        model: "gpt-5-codex",
      }),
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item-1",
          type: "command_execution",
          command:
            "cat .agents/skills/chezmoi-cli-commands/SKILL.md .agents/skills/chezmoi-cli-commands/references/flags.md",
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item-2",
          type: "command_execution",
          command:
            "cat .agents/skills/chezmoi-cli-commands/SKILL.md && chezmoi status",
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item-3",
          type: "agent_message",
          text: "Run `chezmoi status` to inspect pending changes.",
        },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 120, output_tokens: 30 },
      }),
    ].join("\n");

    const shimLogJsonl = JSON.stringify({
      timestamp: "2026-11-22T00:00:00.000Z",
      argv: ["status"],
      outcome: "matched_default",
      exit_code: 0,
    });

    const parsed = parseCodexTrace(rawJsonl, shimLogJsonl, {
      metaDir: "/tmp/run/cases/c1/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 1234,
    });

    expect(parsed.authOrRateLimitError).toBeNull();
    expect(parsed.modelId).toBe("gpt-5-codex");
    expect(parsed.usage).toEqual({ input_tokens: 120, output_tokens: 30 });
    expect(parsed.trace.discovered_skills).toEqual(["chezmoi-cli-commands"]);
    expect(parsed.trace.references_read).toEqual(["references/flags.md"]);
    expect(parsed.trace.commands_invoked).toContain("chezmoi status");
    expect(parsed.trace.final_response).toBe(
      "Run `chezmoi status` to inspect pending changes.",
    );
    expect(parsed.trace.trace_violations).toEqual([]);
    expect(parsed.trace.mock_calls).toEqual([
      {
        command: "chezmoi",
        args: ["status"],
        outcome: "matched_default",
        exit_code: 0,
      },
    ]);
  });

  it("flags trace_violations when commands or file changes touch metaDir or repoEvalsDir", () => {
    const rawJsonl = [
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "cat /tmp/run/cases/c1/meta/rules.json",
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "file_change",
          changes: [{ path: "tests/evals/cli-commands.json", kind: "read" }],
        },
      }),
    ].join("\n");

    const shimLogJsonl = JSON.stringify({
      timestamp: "2026-11-22T00:00:00.000Z",
      argv: ["status"],
      outcome: "cap_exceeded",
      exit_code: 1,
    });

    const parsed = parseCodexTrace(rawJsonl, shimLogJsonl, {
      metaDir: "/tmp/run/cases/c1/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 500,
    });

    expect(parsed.trace.trace_violations.length).toBe(3);
    expect(parsed.trace.trace_violations[0]).toContain("meta directory");
    expect(parsed.trace.trace_violations[1]).toContain("evals directory");
    expect(parsed.trace.trace_violations[2]).toContain(
      "call cap (25) exceeded",
    );
  });

  it("detects auth and rate-limit errors in error and turn.failed events", () => {
    const authJsonl = JSON.stringify({
      type: "error",
      message: "401 Unauthorized: invalid auth token",
    });
    const authParsed = parseCodexTrace(authJsonl, "", {
      metaDir: "/tmp/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 10,
    });
    expect(authParsed.authOrRateLimitError).toContain("401 Unauthorized");

    const rateJsonl = JSON.stringify({
      type: "turn.failed",
      error: { message: "429 rate limit exceeded" },
    });
    const rateParsed = parseCodexTrace(rateJsonl, "", {
      metaDir: "/tmp/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 10,
    });
    expect(rateParsed.authOrRateLimitError).toContain("429 rate limit");
  });
});

describe("parseAgyTrace", () => {
  it("extracts skills, references, commands, final response, and usage from agy stream-json", () => {
    const rawJsonl = [
      JSON.stringify({
        event: "init",
        conversation_id: "conv-1",
      }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_index: 1,
          state: "DONE",
          step_type: "tool",
          tool_name: "read_file",
          tool_info: {
            name: "read_file",
            parameters: {
              Path: "/tmp/work/.agents/skills/chezmoi-cli-commands/SKILL.md",
            },
          },
        },
      }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_index: 2,
          state: "DONE",
          step_type: "tool",
          tool_name: "view_file",
          tool_info: {
            name: "view_file",
            parameters: {
              AbsolutePath:
                "/tmp/work/.agents/skills/chezmoi-cli-commands/references/diff.md",
            },
          },
        },
      }),
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_index: 3,
          state: "DONE",
          step_type: "tool",
          tool_name: "run_command",
          tool_info: {
            name: "run_command",
            parameters: { CommandLine: "chezmoi diff --exclude=scripts" },
          },
        },
      }),
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "conv-1",
          status: "SUCCESS",
          response: "Run `chezmoi diff --exclude=scripts`.",
          usage: { input_tokens: 150, output_tokens: 40 },
        },
      }),
    ].join("\n");

    const parsed = parseAgyTrace(rawJsonl, "", {
      metaDir: "/tmp/run/cases/c1/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 500,
    });

    expect(parsed.authOrRateLimitError).toBeNull();
    expect(parsed.usage).toEqual({ input_tokens: 150, output_tokens: 40 });
    expect(parsed.trace.discovered_skills).toEqual(["chezmoi-cli-commands"]);
    expect(parsed.trace.references_read).toEqual(["references/diff.md"]);
    expect(parsed.trace.commands_invoked).toEqual([
      "chezmoi diff --exclude=scripts",
    ]);
    expect(parsed.trace.final_response).toBe(
      "Run `chezmoi diff --exclude=scripts`.",
    );
    expect(parsed.trace.trace_violations).toEqual([]);
  });

  it("flags trace_violations and detects auth or rate-limit errors in agy stream-json", () => {
    const rawJsonl = [
      JSON.stringify({
        event: "step_update",
        step_update: {
          step_index: 1,
          state: "DONE",
          step_type: "tool",
          tool_name: "read_file",
          tool_info: {
            name: "read_file",
            parameters: { Path: "/tmp/run/cases/c1/meta/rules.json" },
          },
        },
      }),
      JSON.stringify({
        event: "result",
        result: {
          status: "ERROR",
          error: "429 rate limit exceeded",
        },
      }),
    ].join("\n");

    const parsed = parseAgyTrace(rawJsonl, "", {
      metaDir: "/tmp/run/cases/c1/meta",
      repoEvalsDir: "tests/evals",
      durationMs: 100,
    });

    expect(parsed.trace.trace_violations.length).toBe(1);
    expect(parsed.trace.trace_violations[0]).toContain("meta directory");
    expect(parsed.authOrRateLimitError).toContain("429 rate limit");
  });
});

describe("chezmoi shim script", () => {
  const runShim = (
    binPath: string,
    rulesPath: string,
    logPath: string,
    args: string[],
    extraEnv: Record<string, string> = {},
  ) => {
    const proc = Bun.spawnSync([binPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CHEZMOI_SHIM_RULES: rulesPath,
        CHEZMOI_SHIM_LOG: logPath,
        ...extraEnv,
      },
    });
    return {
      exitCode: proc.exitCode,
      stdout: new TextDecoder().decode(proc.stdout),
      stderr: new TextDecoder().decode(proc.stderr),
    };
  };

  it("matches exact match_args before match_regex, handles defaults and unmocked_fallback", () => {
    const dir = makeTempDir("chezmoi-shim-test-");
    const binPath = join(dir, "chezmoi");
    const rulesPath = join(dir, "rules.json");
    const logPath = join(dir, "shim.jsonl");

    writeFileSync(binPath, generateChezmoiShimScript(), "utf-8");
    chmodSync(binPath, 0o755);
    writeFileSync(logPath, "", "utf-8");
    writeFileSync(
      rulesPath,
      JSON.stringify([
        { match_regex: "^apply", stdout: "regex-matched\n", exit_code: 0 },
        {
          match_args: ["apply", "--dry-run"],
          stdout: "exact-matched\n",
          exit_code: 0,
        },
      ]),
      "utf-8",
    );

    const exact = runShim(binPath, rulesPath, logPath, ["apply", "--dry-run"]);
    expect(exact.exitCode).toBe(0);
    expect(exact.stdout).toBe("exact-matched\n");

    const regex = runShim(binPath, rulesPath, logPath, ["apply", "--verbose"]);
    expect(regex.exitCode).toBe(0);
    expect(regex.stdout).toBe("regex-matched\n");

    const ver = runShim(binPath, rulesPath, logPath, ["--version"]);
    expect(ver.exitCode).toBe(0);
    expect(ver.stdout).toContain("chezmoi version v2.62.0 (mocked)");

    const srcPath = runShim(binPath, rulesPath, logPath, ["source-path"], {
      CHEZMOI_SOURCE_DIR: "/tmp/custom-src",
    });
    expect(srcPath.exitCode).toBe(0);
    expect(srcPath.stdout).toBe("/tmp/custom-src\n");

    const data = runShim(binPath, rulesPath, logPath, ["data"]);
    expect(data.exitCode).toBe(0);
    expect(JSON.parse(data.stdout)).toEqual({
      chezmoi: { os: "linux", arch: "amd64" },
    });

    const status = runShim(binPath, rulesPath, logPath, ["status"]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toBe("");

    const unmocked = runShim(binPath, rulesPath, logPath, ["add", "~/.bashrc"]);
    expect(unmocked.exitCode).toBe(1);
    expect(unmocked.stderr).toContain(
      "chezmoi shim: unmocked invocation: add ~/.bashrc",
    );

    const logLines = readFileSync(logPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { outcome: string });
    expect(logLines.map((l) => l.outcome)).toEqual([
      "matched_case",
      "matched_case",
      "matched_default",
      "matched_default",
      "matched_default",
      "matched_default",
      "unmocked_fallback",
    ]);
  });

  it("enforces the 25-call cap with cap_exceeded", () => {
    const dir = makeTempDir("chezmoi-shim-cap-");
    const binPath = join(dir, "chezmoi");
    const rulesPath = join(dir, "rules.json");
    const logPath = join(dir, "shim.jsonl");

    writeFileSync(binPath, generateChezmoiShimScript(), "utf-8");
    chmodSync(binPath, 0o755);
    writeFileSync(rulesPath, "[]", "utf-8");
    writeFileSync(logPath, "", "utf-8");

    for (let i = 0; i < 25; i++) {
      const res = runShim(binPath, rulesPath, logPath, ["status"]);
      expect(res.exitCode).toBe(0);
    }

    const overCap = runShim(binPath, rulesPath, logPath, ["status"]);
    expect(overCap.exitCode).toBe(1);
    expect(overCap.stderr).toContain("chezmoi shim: call cap (25) exceeded");

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(26);
    const last = JSON.parse(lines[25] ?? "{}") as { outcome: string };
    expect(last.outcome).toBe("cap_exceeded");
  });
});

describe("prepareCaseWorkspace and buildRunSummary", () => {
  it("materializes context_files safely and builds summary.json", () => {
    const root = makeTempDir("chezmoi-workspace-");
    const skillsDir = join(root, "skills");
    mkdirSync(join(skillsDir, "cli-commands"), { recursive: true });
    writeFileSync(join(skillsDir, "cli-commands", "SKILL.md"), "# Skill\n");

    const evalsDir = join(root, "evals");
    mkdirSync(evalsDir, { recursive: true });
    const corpusFile = join(evalsDir, "sample.json");
    writeFileSync(corpusFile, "[]", "utf-8");

    const testCase: TestCase = {
      id: "case-1",
      name: "Sample case",
      eval_type: "command_correctness",
      target_skill: "chezmoi-cli-commands",
      origin: "contrived",
      input: {
        user_prompt: "Check status",
        context_files: ["dotfiles/dot_bashrc"],
      },
      expected: {
        exact_command: "chezmoi status",
      },
    };

    const ws = prepareCaseWorkspace(root, testCase, skillsDir);
    expect(
      existsSync(join(ws.workDir, ".agents/skills/cli-commands/SKILL.md")),
    ).toBe(true);
    expect(existsSync(join(ws.workDir, "dotfiles/dot_bashrc"))).toBe(true);
    expect(existsSync(join(ws.metaDir, "bin/chezmoi"))).toBe(true);

    const badCase: TestCase = {
      ...testCase,
      id: "case-bad",
      input: {
        user_prompt: "Escape",
        context_files: ["../outside.txt"],
      },
    };
    expect(() => prepareCaseWorkspace(root, badCase, skillsDir)).toThrow();

    const summary = buildRunSummary({
      timestamp: "2026-11-22T00:00:00.000Z",
      harnessVersion: "codex-cli 0.1.0",
      modelId: "gpt-5-codex",
      skillsDir,
      evalsDir,
      corpusFiles: [corpusFile],
      abortedEarly: false,
      abortReason: null,
      cases: [
        {
          id: "case-1",
          name: "Sample case",
          eval_type: "command_correctness",
          target_skill: "chezmoi-cli-commands",
          passed: true,
          duration_ms: 100,
          assertions: [{ name: "command_matches", passed: true }],
          trace: {
            discovered_skills: ["chezmoi-cli-commands"],
            references_read: [],
            commands_invoked: ["chezmoi status"],
            final_response: "Done",
            trace_violations: [],
            mock_calls: [
              {
                command: "chezmoi",
                args: ["unknown"],
                outcome: "unmocked_fallback",
                exit_code: 1,
              },
            ],
          },
        },
      ],
    });

    expect(summary.schema_version).toBe("1");
    expect(summary.total_cases).toBe(1);
    expect(summary.passed_cases).toBe(1);
    expect(summary.failed_cases).toBe(0);
    expect(summary.unmocked_fallback_count).toBe(1);
    expect(summary.skill_source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.corpus_sha256).toMatch(/^[0-9a-f]{64}$/);

    const baselinePath = join(root, "summary.json");
    writeFileSync(baselinePath, JSON.stringify(summary));
    expect(loadBaselineSummary(baselinePath)).toEqual(summary);
  });
});

describe("eval CLI", () => {
  it("supports validate and run --dry-run without codex preflight", async () => {
    const validateExit = await runCli(["bun", "cli.ts", "validate"]);
    expect(validateExit).toBe(0);

    const dryRunExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--dry-run",
      "--smoke",
    ]);
    expect(dryRunExit).toBe(0);

    const agyDryRunExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--harness",
      "agy",
      "--dry-run",
      "--smoke",
    ]);
    expect(agyDryRunExit).toBe(0);

    const badBaselineExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--baseline",
      "/tmp/nonexistent-baseline-summary.json",
      "--dry-run",
    ]);
    expect(badBaselineExit).toBe(2);

    const badHarnessExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--harness",
      "unknown",
      "--dry-run",
    ]);
    expect(badHarnessExit).toBe(2);

    const badTimeoutExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--timeout",
      "0",
      "--dry-run",
    ]);
    expect(badTimeoutExit).toBe(2);

    const distilledDryRunExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--origin",
      "distilled",
      "--dry-run",
    ]);
    expect(distilledDryRunExit).toBe(0);

    const badOriginExit = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--origin",
      "unknown",
      "--dry-run",
    ]);
    expect(badOriginExit).toBe(2);
  });

  it("returns exit code 2 from validate when corpus is invalid", async () => {
    const dir = makeTempDir("chezmoi-bad-corpus-");
    writeFileSync(join(dir, "broken.json"), "{not-json", "utf-8");
    const exitCode = await runCli([
      "bun",
      "cli.ts",
      "validate",
      "--evals-dir",
      dir,
    ]);
    expect(exitCode).toBe(2);
  });
});

describe("baseline comparison", () => {
  const makeSummary = (
    overrides: Partial<ReturnType<typeof buildRunSummary>>,
  ) => ({
    schema_version: "1" as const,
    timestamp: "2026-11-22T00:00:00.000Z",
    commit_sha: "abc123",
    git_dirty: false,
    harness_name: "codex" as const,
    harness_version: "codex-cli 0.169.0",
    model_id: null,
    skill_source_sha256: "a".repeat(64),
    corpus_sha256: "b".repeat(64),
    aborted_early: false,
    abort_reason: null,
    total_cases: 3,
    passed_cases: 2,
    failed_cases: 1,
    failed_case_ids: ["TC-2"],
    unmocked_fallback_count: 0,
    cases: [
      {
        id: "TC-1",
        name: "Pass -> Fail",
        eval_type: "trigger_matching" as const,
        target_skill: "chezmoi-cli-commands",
        passed: true,
        duration_ms: 10,
        assertions: [],
        trace: {
          discovered_skills: [],
          references_read: [],
          commands_invoked: [],
          final_response: "",
          trace_violations: [],
        },
      },
      {
        id: "TC-2",
        name: "Fail -> Pass",
        eval_type: "trigger_matching" as const,
        target_skill: "chezmoi-cli-commands",
        passed: false,
        duration_ms: 10,
        assertions: [],
        trace: {
          discovered_skills: [],
          references_read: [],
          commands_invoked: [],
          final_response: "",
          trace_violations: [],
        },
      },
      {
        id: "TC-3",
        name: "Fail -> Fail",
        eval_type: "trigger_matching" as const,
        target_skill: "chezmoi-cli-commands",
        passed: false,
        duration_ms: 10,
        assertions: [],
        trace: {
          discovered_skills: [],
          references_read: [],
          commands_invoked: [],
          final_response: "",
          trace_violations: [],
        },
      },
    ],
    ...overrides,
  });

  it.each([
    ["null case", [null], "$.cases[0]"],
    [
      "missing ID",
      [{ ...makeSummary({}).cases[0], id: undefined }],
      "$.cases[0].id",
    ],
    [
      "non-boolean passed",
      [{ ...makeSummary({}).cases[0], passed: "false" }],
      "$.cases[0].passed",
    ],
    [
      "invalid assertion",
      [{ ...makeSummary({}).cases[0], assertions: [null] }],
      "$.cases[0].assertions[0]",
    ],
    [
      "duplicate ID",
      [makeSummary({}).cases[0], makeSummary({}).cases[0]],
      "$.cases[1].id: duplicate case ID",
    ],
  ] as const)(
    "rejects %s before starting the harness",
    async (_label, cases, field) => {
      const dir = makeTempDir("chezmoi-invalid-baseline-");
      const baselinePath = join(dir, "baseline.json");
      writeFileSync(
        baselinePath,
        JSON.stringify({ ...makeSummary({}), cases }),
      );

      const stderr = spyOn(console, "error").mockImplementation(() => {});
      const which = spyOn(Bun, "which");
      try {
        expect(
          await runCli([
            "bun",
            "cli.ts",
            "run",
            "--harness",
            "codex",
            "--baseline",
            baselinePath,
          ]),
        ).toBe(2);
        expect(stderr).toHaveBeenCalledWith(
          expect.stringContaining(`${baselinePath} at ${field}`),
        );
        expect(which.mock.calls.some(([binary]) => binary === "codex")).toBe(
          false,
        );
      } finally {
        which.mockRestore();
        stderr.mockRestore();
      }
    },
  );

  it("reports the field when a summary field has the wrong type", () => {
    const dir = makeTempDir("chezmoi-invalid-summary-");
    const baselinePath = join(dir, "baseline.json");
    writeFileSync(
      baselinePath,
      JSON.stringify({ ...makeSummary({}), harness_version: false }),
    );
    expect(() => loadBaselineSummary(baselinePath)).toThrow(
      `${baselinePath} at $.harness_version`,
    );
  });

  it("reports new_failures, new_passes, unchanged_failures, and drift warnings", () => {
    const dir = makeTempDir("chezmoi-baseline-");
    const baselinePath = join(dir, "baseline.json");

    const baseline = makeSummary({});
    writeFileSync(baselinePath, JSON.stringify(baseline), "utf-8");
    const loaded = loadBaselineSummary(baselinePath);
    expect(loaded).toEqual(baseline);

    const current = makeSummary({
      corpus_sha256: "c".repeat(64),
      harness_version: "codex-cli 0.170.0",
      cases: [
        { ...baseline.cases[0]!, passed: false },
        { ...baseline.cases[1]!, passed: true },
        { ...baseline.cases[2]!, passed: false },
      ],
    });

    const diff = compareAgainstBaseline(current, loaded);
    expect(diff.new_failures).toEqual(["TC-1"]);
    expect(diff.new_passes).toEqual(["TC-2"]);
    expect(diff.unchanged_failures).toEqual(["TC-3"]);
    expect(diff.drift_warnings).toHaveLength(2);
    expect(diff.drift_warnings[0]).toContain("corpus_sha256 drift");
    expect(diff.drift_warnings[1]).toContain("harness_version drift");
  });
});
