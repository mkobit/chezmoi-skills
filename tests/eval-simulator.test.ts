import { afterEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runCli } from "../scripts/evals/cli.ts";
import {
  SimulationConfigSchema,
  type TestCase,
  TestCaseSchema,
} from "../scripts/evals/corpus.ts";
import {
  generateChezmoiShimScript,
  parseShimLog,
} from "../scripts/evals/runner.ts";
import {
  aggregateNormalizedTrace,
  buildSimulatorPrompt,
  buildTranscriptReplayPrompt,
  clampMaxTurns,
  extractAgySessionId,
  extractCodexThreadId,
  runSimulationSuite,
  SimulationTranscriptSchema,
  SimulatorTurnSchema,
} from "../scripts/evals/simulator.ts";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const createMockSkillsAndEvals = (root: string, testCases: TestCase[]) => {
  const evalsDir = join(root, "evals");
  const skillsDir = join(root, "skills");
  const outDir = join(root, "out");
  mkdirSync(evalsDir, { recursive: true });
  mkdirSync(join(skillsDir, "chezmoi-cli-commands"), { recursive: true });
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(skillsDir, "chezmoi-cli-commands", "SKILL.md"),
    "---\nname: chezmoi-cli-commands\ndescription: Manage chezmoi CLI commands.\n---\n# chezmoi CLI commands\n",
    "utf-8",
  );
  writeFileSync(
    join(evalsDir, "sim_eval.json"),
    JSON.stringify(testCases, null, 2),
    "utf-8",
  );

  return { evalsDir, skillsDir, outDir };
};

const setupIsolatedMockEnv = (
  root: string,
  mockBinDir: string,
): { restore: () => void } => {
  const fakeHome = join(root, "host_home");
  const fakeCodexHome = join(fakeHome, ".codex");
  const fakeAgyDir = join(fakeHome, ".gemini", "antigravity-cli");
  mkdirSync(fakeCodexHome, { recursive: true });
  mkdirSync(fakeAgyDir, { recursive: true });
  writeFileSync(
    join(fakeCodexHome, "auth.json"),
    '{"token":"fake-codex"}',
    "utf-8",
  );
  writeFileSync(
    join(fakeAgyDir, "antigravity-oauth-token"),
    "fake-agy-token",
    "utf-8",
  );

  const prevPath = process.env.PATH;
  const prevHome = process.env.HOME;
  const prevCodexHome = process.env.CODEX_HOME;

  process.env.PATH = `${mockBinDir}:${prevPath ?? ""}`;
  process.env.HOME = fakeHome;
  process.env.CODEX_HOME = fakeCodexHome;

  return {
    restore: () => {
      process.env.PATH = prevPath;
      if (prevHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = prevHome;
      }
      if (prevCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = prevCodexHome;
      }
    },
  };
};

const writeExecutable = (path: string, content: string): void => {
  writeFileSync(path, content, "utf-8");
  chmodSync(path, 0o755);
};

const makeSimCase = (overrides?: Partial<TestCase>): TestCase =>
  TestCaseSchema.parse({
    id: "TC-SIM-001",
    name: "Multi-turn apply guidance",
    eval_type: "answer_quality",
    target_skill: "chezmoi-cli-commands",
    origin: "contrived",
    input: { user_prompt: "How do I apply my dotfiles?" },
    expected: {
      answer_quality: {
        required_concepts: ["chezmoi diff", "chezmoi apply"],
      },
    },
    simulation: {
      persona: "Careful developer on macOS",
      goal: "Verify diff before apply",
      scenario_facts: ["Uses macOS", "Wants to preview changes first"],
      max_turns: 4,
      shim_call_cap: 25,
    },
    ...overrides,
  });

describe("SimulationConfigSchema and simulator helpers", () => {
  it("validates SimulationConfigSchema defaults and bounds", () => {
    const parsed = SimulationConfigSchema.parse({
      persona: "New chezmoi user",
      goal: "Initialize dotfiles",
      scenario_facts: ["GitHub repo is user/dotfiles"],
    });
    expect(parsed.max_turns).toBe(4);
    expect(parsed.shim_call_cap).toBe(25);

    expect(() =>
      SimulationConfigSchema.parse({
        persona: "User",
        goal: "Goal",
        scenario_facts: [],
      }),
    ).toThrow();
    expect(() =>
      SimulationConfigSchema.parse({
        persona: "User",
        goal: "Goal",
        scenario_facts: ["Fact"],
        max_turns: 1,
      }),
    ).toThrow();
    expect(() =>
      SimulationConfigSchema.parse({
        persona: "User",
        goal: "Goal",
        scenario_facts: ["Fact"],
        max_turns: 9,
      }),
    ).toThrow();
    expect(() =>
      SimulationConfigSchema.parse({
        persona: "User",
        goal: "Goal",
        scenario_facts: ["Fact"],
        shim_call_cap: 41,
      }),
    ).toThrow();
  });

  it("clamps max_turns and extracts session identifiers", () => {
    expect(clampMaxTurns(1)).toBe(2);
    expect(clampMaxTurns(5)).toBe(5);
    expect(clampMaxTurns(12)).toBe(8);

    expect(
      extractCodexThreadId(
        '{"type":"thread.started","thread_id":"thr_abc123"}\n',
      ),
    ).toBe("thr_abc123");
    expect(extractCodexThreadId('{"type":"turn.completed"}\n')).toBeNull();

    expect(
      extractAgySessionId(
        '{"event":"result","result":{"status":"SUCCESS","conversation_id":"conv_xyz"}}\n',
      ),
    ).toBe("conv_xyz");
  });

  it("builds simulator and replay prompts and aggregates NormalizedTrace", () => {
    const sim = SimulationConfigSchema.parse({
      persona: "Linux user",
      goal: "Check diff",
      scenario_facts: ["Uses zsh"],
    });
    const prompt = buildSimulatorPrompt({
      simulation: sim,
      currentTurn: 1,
      maxTurns: 4,
      turns: [
        {
          user_message: "How do I update?",
          assistant_response: "Which OS are you using?",
        },
      ],
    });
    expect(prompt).toContain("Linux user");
    expect(prompt).toContain("Turn: 1 of 4");
    expect(prompt).toContain("Uses zsh");

    const replay = buildTranscriptReplayPrompt(
      [{ user_message: "Hi", assistant_response: "Hello" }],
      "Next question",
    );
    expect(replay).toContain("Turn 1 User:");
    expect(replay).toContain("Current User Message:\nNext question");

    const aggregated = aggregateNormalizedTrace({
      turnTraces: [
        {
          discovered_skills: ["chezmoi-cli-commands"],
          references_read: ["references/commands.md"],
          commands_invoked: [
            "cat .agents/skills/chezmoi-cli-commands/SKILL.md",
          ],
          final_response: "First reply",
          trace_violations: [],
        },
        {
          discovered_skills: ["chezmoi-cli-commands", "chezmoi-templating"],
          references_read: ["references/commands.md"],
          commands_invoked: ["chezmoi diff"],
          final_response: "Final reply with chezmoi diff and chezmoi apply",
          trace_violations: [],
        },
      ],
      shimLogJsonl:
        '{"argv":["diff"],"outcome":"matched_default","exit_code":0}\n',
      shimCallCap: 25,
    });

    expect(aggregated.discovered_skills).toEqual([
      "chezmoi-cli-commands",
      "chezmoi-templating",
    ]);
    expect(aggregated.references_read).toEqual(["references/commands.md"]);
    expect(aggregated.final_response).toBe(
      "Final reply with chezmoi diff and chezmoi apply",
    );
    expect(aggregated.mock_calls).toHaveLength(1);
  });

  it("enforces configurable CHEZMOI_SHIM_CALL_CAP in generated shim", () => {
    const root = makeTempDir("shim-cap");
    const shimPath = join(root, "chezmoi");
    const rulesPath = join(root, "rules.json");
    const logPath = join(root, "shim.jsonl");

    writeExecutable(shimPath, generateChezmoiShimScript());
    writeFileSync(rulesPath, "[]", "utf-8");
    writeFileSync(logPath, "", "utf-8");

    const env = {
      ...process.env,
      CHEZMOI_SHIM_RULES: rulesPath,
      CHEZMOI_SHIM_LOG: logPath,
      CHEZMOI_SHIM_CALL_CAP: "2",
    };

    expect(Bun.spawnSync([shimPath, "status"], { env }).exitCode).toBe(0);
    expect(Bun.spawnSync([shimPath, "status"], { env }).exitCode).toBe(0);
    const third = Bun.spawnSync([shimPath, "status"], {
      env,
      stderr: "pipe",
    });
    expect(third.exitCode).toBe(1);
    expect(new TextDecoder().decode(third.stderr)).toContain("call cap (2)");

    const violations: string[] = [];
    parseShimLog(readFileSync(logPath, "utf-8"), [], violations, [], 2);
    expect(violations).toEqual(["chezmoi shim call cap (2) exceeded"]);
  });
});

describe("runSimulationSuite with mocked codex and agy harnesses", () => {
  it("runs multi-turn codex simulation with per-case codex_home, resume, and transcript.json", async () => {
    const root = makeTempDir("sim-codex");
    const mockBin = join(root, "bin");
    mkdirSync(mockBin, { recursive: true });
    const counterPath = join(root, "codex-calls.txt");
    const argLogPath = join(root, "codex-args.jsonl");

    writeExecutable(
      join(mockBin, "codex"),
      `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.99.0"); process.exit(0); }
if (args[0] === "exec" && args[1] === "--help") {
  console.log("--ignore-user-config --ignore-rules --output-schema -o");
  process.exit(0);
}
appendFileSync(${JSON.stringify(argLogPath)}, JSON.stringify({ args, codexHome: process.env.CODEX_HOME }) + "\\n");

// Structured simulator invocation uses --output-schema
const outIdx = args.indexOf("-o");
if (outIdx !== -1) {
  const outPath = args[outIdx + 1];
  writeFileSync(outPath, JSON.stringify({
    status: "goal_reached",
    message: "",
    reason: "Assistant explained both chezmoi diff and chezmoi apply.",
  }));
  console.log(JSON.stringify({ type: "thread.started", thread_id: "sim_t1", model: "gpt-sim" }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }));
  process.exit(0);
}

const count = existsSync(${JSON.stringify(counterPath)})
  ? Number.parseInt(readFileSync(${JSON.stringify(counterPath)}, "utf-8"), 10) + 1
  : 1;
writeFileSync(${JSON.stringify(counterPath)}, String(count));

if (args[1] === "resume") {
  const stdinText = await new Response(Bun.stdin.stream()).text();
  console.log(JSON.stringify({ type: "thread.started", thread_id: args[args.length - 2], model: "gpt-eval" }));
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Run chezmoi diff first, then chezmoi apply. (got: " + stdinText.trim() + ")" } }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 30, output_tokens: 20 } }));
  process.exit(0);
}

console.log(JSON.stringify({ type: "thread.started", thread_id: "thr_case_001", model: "gpt-eval" }));
console.log(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "cat .agents/skills/chezmoi-cli-commands/SKILL.md" } }));
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Which OS are you using before running chezmoi diff?" } }));
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 20, output_tokens: 10 } }));
`,
    );

    const testCase = makeSimCase();
    const { evalsDir, skillsDir, outDir } = createMockSkillsAndEvals(root, [
      testCase,
    ]);
    const { restore } = setupIsolatedMockEnv(root, mockBin);

    let simTurnCalls = 0;
    try {
      const result = await runSimulationSuite(
        [testCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "codex",
          evalsDir,
          skillsDir,
          outDir,
          timeoutMs: 10000,
          caseTimeoutMs: 30000,
          keepWorkdir: false,
          invokeSimulator: async () => {
            simTurnCalls++;
            if (simTurnCalls === 1) {
              return {
                ok: true,
                data: SimulatorTurnSchema.parse({
                  status: "continue",
                  message: "I am on macOS.",
                  reason: "Provide OS fact to answer clarifying question.",
                }),
                authOrRateLimitError: null,
                modelId: "gpt-sim",
                usage: { input_tokens: 15, output_tokens: 8 },
                durationMs: 12,
                rawOutput: "{}",
                stderr: "",
              };
            }
            return {
              ok: true,
              data: SimulatorTurnSchema.parse({
                status: "goal_reached",
                message: "",
                reason: "Assistant provided chezmoi diff and chezmoi apply.",
              }),
              authOrRateLimitError: null,
              modelId: "gpt-sim",
              durationMs: 10,
              rawOutput: "{}",
              stderr: "",
            };
          },
        },
      );

      expect(result.dryRun).toBe(false);
      expect(result.summary?.passed_cases).toBe(1);
      expect(result.summary?.cases[0]?.usage).toEqual({
        input_tokens: 50,
        output_tokens: 30,
      });

      const caseDir = join(result.runOutDir!, "cases", "TC-SIM-001");
      const transcriptRaw = readFileSync(
        join(caseDir, "transcript.json"),
        "utf-8",
      );
      const transcript = SimulationTranscriptSchema.parse(
        JSON.parse(transcriptRaw),
      );
      expect(transcript.stop_reason).toBe("goal_reached");
      expect(transcript.total_turns).toBe(2);
      expect(transcript.turns[0]?.simulator_decision?.status).toBe("continue");
      expect(transcript.turns[1]?.simulator_decision?.status).toBe(
        "goal_reached",
      );

      const events = readFileSync(join(caseDir, "codex-events.jsonl"), "utf-8");
      expect(events).toContain("thr_case_001");
      expect(events).toContain("I am on macOS.");

      const argLog = readFileSync(argLogPath, "utf-8")
        .trim()
        .split("\n")
        .map(
          (line) => JSON.parse(line) as { args: string[]; codexHome: string },
        );
      expect(argLog[0]?.args).not.toContain("--ephemeral");
      expect(argLog[1]?.args).toContain("resume");
      expect(argLog[1]?.args).toContain("thr_case_001");
      expect(argLog[0]?.codexHome).toContain("TC-SIM-001/codex_home");
    } finally {
      restore();
    }
  });

  it("supports agy --conversation resume and falls back to transcript replay on resume failure", async () => {
    const root = makeTempDir("sim-agy");
    const mockBin = join(root, "bin");
    mkdirSync(mockBin, { recursive: true });
    const argLogPath = join(root, "agy-args.jsonl");

    writeExecutable(
      join(mockBin, "agy"),
      `#!${process.execPath}
import { appendFileSync } from "fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("agy 1.2.0"); process.exit(0); }
if (args[0] === "--help") {
  console.log("--print --output-format --json-schema --disable-slash-commands --sandbox");
  process.exit(0);
}
appendFileSync(${JSON.stringify(argLogPath)}, JSON.stringify({ args, home: process.env.HOME }) + "\\n");

if (args.includes("--conversation")) {
  // Simulate session resume failing under isolated HOME
  process.stderr.write("conversation not found");
  process.exit(1);
}

const printArg = args.find((a) => a.startsWith("--print=")) ?? "";
if (printArg.includes("Current User Message:")) {
  console.log(JSON.stringify({
    event: "result",
    result: { status: "SUCCESS", response: "Preview with chezmoi diff then chezmoi apply." },
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  event: "result",
  result: { status: "SUCCESS", conversation_id: "conv_001", response: "What OS are you on?" },
}));
`,
    );

    const testCase = makeSimCase({ id: "TC-SIM-AGY" });
    const { evalsDir, skillsDir, outDir } = createMockSkillsAndEvals(root, [
      testCase,
    ]);
    const { restore } = setupIsolatedMockEnv(root, mockBin);

    let turnCalls = 0;
    try {
      const result = await runSimulationSuite(
        [testCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "agy",
          evalsDir,
          skillsDir,
          outDir,
          timeoutMs: 10000,
          caseTimeoutMs: 30000,
          keepWorkdir: false,
          invokeSimulator: async () => {
            turnCalls++;
            if (turnCalls === 1) {
              return {
                ok: true,
                data: {
                  status: "continue",
                  message: "macOS",
                  reason: "Answer OS",
                },
                authOrRateLimitError: null,
                modelId: null,
                durationMs: 5,
                rawOutput: "{}",
                stderr: "",
              };
            }
            return {
              ok: true,
              data: { status: "goal_reached", message: "", reason: "Done" },
              authOrRateLimitError: null,
              modelId: null,
              durationMs: 5,
              rawOutput: "{}",
              stderr: "",
            };
          },
        },
      );

      expect(result.summary?.passed_cases).toBe(1);
      const calls = readFileSync(argLogPath, "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { args: string[]; home: string });
      expect(calls).toHaveLength(3);
      expect(calls[1]?.args).toContain("--conversation");
      expect(
        calls[2]?.args.some((a) => a.includes("Current User Message:")),
      ).toBe(true);
      expect(calls[0]?.home).toContain("TC-SIM-AGY/agy_home");
    } finally {
      restore();
    }
  });

  it("enforces stall guard, max_turns_reached, cap_exceeded, and auth abort cascade", async () => {
    const root = makeTempDir("sim-cascade");
    const mockBin = join(root, "bin");
    mkdirSync(mockBin, { recursive: true });
    const modeFile = join(root, "mode.txt");

    writeExecutable(
      join(mockBin, "codex"),
      `#!${process.execPath}
import { readFileSync } from "fs";
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("codex-cli 0.99.0"); process.exit(0); }
if (args[0] === "exec" && args[1] === "--help") {
  console.log("--ignore-user-config --ignore-rules --output-schema -o");
  process.exit(0);
}
const mode = readFileSync(${JSON.stringify(modeFile)}, "utf-8").trim();
if (mode === "auth") {
  console.log(JSON.stringify({ type: "error", message: "429 rate limit exceeded" }));
  process.exit(1);
}
if (mode === "cap") {
  Bun.spawnSync(["chezmoi", "status"]);
  Bun.spawnSync(["chezmoi", "status"]);
  Bun.spawnSync(["chezmoi", "status"]);
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "chezmoi diff and chezmoi apply" } }));
  process.exit(0);
}
if (mode === "stall") {
  console.log(JSON.stringify({ type: "thread.started", thread_id: "thr_stall" }));
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Identical reply" } }));
  process.exit(0);
}
console.log(JSON.stringify({ type: "thread.started", thread_id: "thr_max" }));
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Turn reply " + Date.now() + Math.random() } }));
`,
    );

    const stallCase = makeSimCase({
      id: "TC-STALL",
      simulation: {
        persona: "User",
        goal: "Goal",
        scenario_facts: ["Fact"],
        max_turns: 4,
        shim_call_cap: 2,
      },
    });
    const { evalsDir, skillsDir, outDir } = createMockSkillsAndEvals(root, [
      stallCase,
    ]);
    const { restore } = setupIsolatedMockEnv(root, mockBin);

    try {
      // 1. Stall guard
      writeFileSync(modeFile, "stall", "utf-8");
      const stallRes = await runSimulationSuite(
        [stallCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "codex",
          evalsDir,
          skillsDir,
          outDir,
          timeoutMs: 5000,
          caseTimeoutMs: 15000,
          keepWorkdir: false,
          invokeSimulator: async () => ({
            ok: true,
            data: {
              status: "continue",
              message: "Please continue",
              reason: "Continue",
            },
            authOrRateLimitError: null,
            modelId: null,
            durationMs: 5,
            rawOutput: "{}",
            stderr: "",
          }),
        },
      );
      const stallTranscript = JSON.parse(
        readFileSync(
          join(stallRes.runOutDir!, "cases", "TC-STALL", "transcript.json"),
          "utf-8",
        ),
      );
      expect(stallTranscript.stop_reason).toBe("stalled");
      expect(stallTranscript.total_turns).toBe(2);

      // 2. Max turns reached (clamped to 2)
      writeFileSync(modeFile, "max", "utf-8");
      let simCalls = 0;
      const maxRes = await runSimulationSuite(
        [stallCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "codex",
          evalsDir,
          skillsDir,
          outDir,
          maxTurns: 2,
          timeoutMs: 5000,
          caseTimeoutMs: 15000,
          keepWorkdir: false,
          invokeSimulator: async () => {
            simCalls++;
            return {
              ok: true,
              data: { status: "continue", message: "More", reason: "More" },
              authOrRateLimitError: null,
              modelId: null,
              durationMs: 5,
              rawOutput: "{}",
              stderr: "",
            };
          },
        },
      );
      const maxTranscript = JSON.parse(
        readFileSync(
          join(maxRes.runOutDir!, "cases", "TC-STALL", "transcript.json"),
          "utf-8",
        ),
      );
      expect(maxTranscript.stop_reason).toBe("max_turns_reached");
      expect(maxTranscript.total_turns).toBe(2);
      expect(simCalls).toBe(1);

      // 3. Cap exceeded
      writeFileSync(modeFile, "cap", "utf-8");
      const capRes = await runSimulationSuite(
        [stallCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "codex",
          evalsDir,
          skillsDir,
          outDir,
          timeoutMs: 5000,
          caseTimeoutMs: 15000,
          keepWorkdir: false,
          invokeSimulator: async () => ({
            ok: true,
            data: { status: "continue", message: "More", reason: "More" },
            authOrRateLimitError: null,
            modelId: null,
            durationMs: 5,
            rawOutput: "{}",
            stderr: "",
          }),
        },
      );
      expect(capRes.summary?.cases[0]?.passed).toBe(false);
      const capTranscript = JSON.parse(
        readFileSync(
          join(capRes.runOutDir!, "cases", "TC-STALL", "transcript.json"),
          "utf-8",
        ),
      );
      expect(capTranscript.stop_reason).toBe("cap_exceeded");

      // 4. Auth/rate-limit abort
      writeFileSync(modeFile, "auth", "utf-8");
      const authRes = await runSimulationSuite(
        [stallCase],
        [join(evalsDir, "sim_eval.json")],
        {
          harness: "codex",
          evalsDir,
          skillsDir,
          outDir,
          timeoutMs: 5000,
          caseTimeoutMs: 15000,
          keepWorkdir: false,
          invokeSimulator: async () => ({
            ok: true,
            data: { status: "continue", message: "More", reason: "More" },
            authOrRateLimitError: null,
            modelId: null,
            durationMs: 5,
            rawOutput: "{}",
            stderr: "",
          }),
        },
      );
      expect(authRes.summary?.aborted_early).toBe(true);
      expect(authRes.summary?.abort_reason).toContain("429");
    } finally {
      restore();
    }
  });
});

describe("CLI simulate and run --include-multi-turn", () => {
  it("supports simulate --dry-run and gates simulation cases behind --include-multi-turn on run", async () => {
    const root = makeTempDir("sim-cli");
    const singleCase = TestCaseSchema.parse({
      id: "TC-SINGLE-001",
      name: "Single turn case",
      eval_type: "answer_quality",
      target_skill: "chezmoi-cli-commands",
      input: { user_prompt: "How do I check status?" },
      expected: { answer_quality: { required_concepts: ["chezmoi status"] } },
    });
    const simCase = makeSimCase({ id: "TC-MULTI-001" });
    const { evalsDir, skillsDir, outDir } = createMockSkillsAndEvals(root, [
      singleCase,
      simCase,
    ]);

    const simDryExit = await runCli([
      "node",
      "cli.ts",
      "simulate",
      "--dry-run",
      "--evals-dir",
      evalsDir,
      "--skills-dir",
      skillsDir,
      "--out-dir",
      outDir,
    ]);
    expect(simDryExit).toBe(0);

    const runDefaultExit = await runCli([
      "node",
      "cli.ts",
      "run",
      "--dry-run",
      "--case",
      "TC-MULTI-001",
      "--evals-dir",
      evalsDir,
      "--skills-dir",
      skillsDir,
    ]);
    expect(runDefaultExit).toBe(0);

    const runMultiExit = await runCli([
      "node",
      "cli.ts",
      "run",
      "--dry-run",
      "--include-multi-turn",
      "--case",
      "TC-MULTI-001",
      "--evals-dir",
      evalsDir,
      "--skills-dir",
      skillsDir,
    ]);
    expect(runMultiExit).toBe(0);

    const badHarnessExit = await runCli([
      "node",
      "cli.ts",
      "simulate",
      "--sim-harness",
      "unknown",
      "--evals-dir",
      evalsDir,
    ]);
    expect(badHarnessExit).toBe(2);
  });
});
