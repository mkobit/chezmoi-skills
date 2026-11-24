import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import {
  evaluateTrace,
  type MockCallRecord,
  type NormalizedTrace,
  type SimulationConfig,
  type TestCase,
} from "./corpus.ts";
import {
  AUTH_OR_RATE_LIMIT_RE,
  buildIsolatedCaseEnv,
  buildRunSummary,
  type CaseExecResult,
  type CaseResult,
  type CaseWorkspace,
  checkHarnessPreflight,
  ConfigError,
  type HarnessName,
  invokeStructuredHarness,
  type InvokeStructuredHarnessParams,
  type InvokeStructuredHarnessResult,
  parseAgyTrace,
  parseCodexTrace,
  parseShimLog,
  prepareCaseWorkspace,
  prepareIsolatedHarnessAuth,
  type RunScope,
  type RunSummary,
  spawnWithTimeout,
} from "./runner.ts";

export const SIMULATOR_TIMEOUT_MS = 45000;
export const MIN_SIMULATION_TURNS = 2;
export const MAX_SIMULATION_TURNS = 8;

export const SimulatorTurnSchema = z.object({
  status: z.enum(["continue", "goal_reached", "stuck"]),
  message: z.string(),
  reason: z.string().min(1),
});

export const SimulationStopReasonSchema = z.enum([
  "auth_or_rate_limit",
  "execution_failed",
  "trace_violation",
  "cap_exceeded",
  "max_turns_reached",
  "goal_reached",
  "simulator_stuck",
  "stalled",
]);

export const TranscriptTurnSchema = z.object({
  turn: z.number().int().min(1),
  user_message: z.string(),
  assistant_response: z.string(),
  duration_ms: z.number().int().nonnegative(),
  exit_code: z.number().int(),
  timed_out: z.boolean(),
  usage: z.record(z.string(), z.unknown()).optional(),
  simulator_decision: SimulatorTurnSchema.extend({
    duration_ms: z.number().int().nonnegative(),
    usage: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

export const SimulationTranscriptSchema = z.object({
  schema_version: z.literal("1"),
  case_id: z.string().min(1),
  harness: z.enum(["codex", "agy"]),
  sim_harness: z.enum(["codex", "agy"]),
  stop_reason: SimulationStopReasonSchema,
  stop_detail: z.string().optional(),
  total_turns: z.number().int().nonnegative(),
  total_duration_ms: z.number().int().nonnegative(),
  turns: z.array(TranscriptTurnSchema),
});

export type SimulatorTurn = z.infer<typeof SimulatorTurnSchema>;
export type SimulationStopReason = z.infer<typeof SimulationStopReasonSchema>;
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
export type SimulationTranscript = z.infer<typeof SimulationTranscriptSchema>;

export type StructuredSimulatorInvoker = (
  params: InvokeStructuredHarnessParams<typeof SimulatorTurnSchema>,
) => Promise<InvokeStructuredHarnessResult<SimulatorTurn>>;

export interface SimulateOptions {
  harness: HarnessName;
  simHarness?: HarnessName;
  simModel?: string;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
  maxTurns?: number;
  timeoutMs: number;
  caseTimeoutMs: number;
  dryRun?: boolean;
  keepWorkdir: boolean;
  runScope?: RunScope;
  skippedCases?: number;
  invokeSimulator?: StructuredSimulatorInvoker;
}

export interface DryRunSimulationCase {
  id: string;
  target_skill: string;
  eval_type: TestCase["eval_type"];
  max_turns: number;
  shim_call_cap: number;
  name: string;
}

export interface SimulateSuiteResult {
  dryRun: boolean;
  dryRunCases?: DryRunSimulationCase[];
  summary?: RunSummary;
  runOutDir?: string;
}

/**
 * Clamps a turn budget to the supported `[2, 8]` range.
 */
export const clampMaxTurns = (value: number): number =>
  Math.min(MAX_SIMULATION_TURNS, Math.max(MIN_SIMULATION_TURNS, value));

/**
 * Extracts the Codex `thread_id` from `codex exec --json` JSONL events.
 */
export const extractCodexThreadId = (rawJsonl: string): string | null => {
  for (const line of rawJsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") continue;
      const event = parsed as Record<string, unknown>;
      if (
        event.type === "thread.started" &&
        typeof event.thread_id === "string" &&
        event.thread_id.trim().length > 0
      ) {
        return event.thread_id.trim();
      }
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Extracts a session or conversation identifier from `agy --output-format stream-json` events.
 */
export const extractAgySessionId = (rawJsonl: string): string | null => {
  for (const line of rawJsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") continue;
      const event = parsed as Record<string, unknown>;
      for (const key of ["conversation_id", "session_id", "thread_id"]) {
        if (typeof event[key] === "string" && event[key].trim().length > 0) {
          return event[key].trim();
        }
      }
      if (event.result && typeof event.result === "object") {
        const res = event.result as Record<string, unknown>;
        for (const key of ["conversation_id", "session_id", "thread_id"]) {
          if (typeof res[key] === "string" && res[key].trim().length > 0) {
            return res[key].trim();
          }
        }
      }
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Builds a bounded transcript-replay prompt when native session resumption is unavailable.
 */
export const buildTranscriptReplayPrompt = (
  turns: Array<{ user_message: string; assistant_response: string }>,
  nextUserMessage: string,
): string => {
  const history = turns
    .map(
      (turn, idx) =>
        `Turn ${idx + 1} User:\n${turn.user_message}\n\nTurn ${idx + 1} Assistant:\n${turn.assistant_response}`,
    )
    .join("\n\n---\n\n");

  return [
    "Continue this conversation using the prior turns for context.",
    "",
    history,
    "",
    "---",
    "",
    `Current User Message:\n${nextUserMessage}`,
  ].join("\n");
};

/**
 * Builds the structured prompt for the simulated user turn.
 */
export const buildSimulatorPrompt = (params: {
  simulation: SimulationConfig;
  currentTurn: number;
  maxTurns: number;
  turns: Array<{ user_message: string; assistant_response: string }>;
}): string => {
  const facts = params.simulation.scenario_facts
    .map((fact) => `- ${fact}`)
    .join("\n");
  const history = params.turns
    .map(
      (turn, idx) =>
        `[Turn ${idx + 1}]\nUser: ${turn.user_message}\nAssistant: ${turn.assistant_response}`,
    )
    .join("\n\n");

  return [
    "You are simulating a real user interacting with a chezmoi dotfiles assistant.",
    "Stay strictly in character, pursue the goal using only the scenario facts below, and respond concisely.",
    "",
    `Persona: ${params.simulation.persona}`,
    `Goal: ${params.simulation.goal}`,
    `Turn: ${params.currentTurn} of ${params.maxTurns}`,
    "",
    "Scenario facts:",
    facts,
    "",
    "Conversation history:",
    history,
    "",
    "Decide the next step and return JSON matching SimulatorTurnSchema:",
    '- status="goal_reached" if the assistant has satisfied the user goal.',
    '- status="stuck" if the assistant is looping, refusing unreasonably, or cannot make progress.',
    '- status="continue" with a non-empty user message to answer clarifying questions, supply scenario facts, or add the next constraint.',
    "- reason: brief one-sentence explanation for your status.",
  ].join("\n");
};

const addUnique = (target: string[], value: string): void => {
  if (!target.includes(value)) {
    target.push(value);
  }
};

/**
 * Merges per-turn traces and the shared per-case `shim.jsonl` into a single `NormalizedTrace`.
 */
export const aggregateNormalizedTrace = (params: {
  turnTraces: NormalizedTrace[];
  shimLogJsonl: string;
  shimCallCap: number;
}): NormalizedTrace => {
  const discoveredSkills: string[] = [];
  const referencesRead: string[] = [];
  const commandsInvoked: string[] = [];
  const traceViolations: string[] = [];
  const mockCalls: MockCallRecord[] = [];
  let finalResponse = "";

  for (const trace of params.turnTraces) {
    for (const skill of trace.discovered_skills) {
      addUnique(discoveredSkills, skill);
    }
    for (const ref of trace.references_read) {
      addUnique(referencesRead, ref);
    }
    for (const cmd of trace.commands_invoked) {
      commandsInvoked.push(cmd);
    }
    for (const violation of trace.trace_violations) {
      addUnique(traceViolations, violation);
    }
    finalResponse = trace.final_response;
  }

  parseShimLog(
    params.shimLogJsonl,
    commandsInvoked,
    traceViolations,
    mockCalls,
    params.shimCallCap,
  );

  return {
    discovered_skills: discoveredSkills,
    references_read: referencesRead,
    commands_invoked: commandsInvoked,
    final_response: finalResponse,
    trace_violations: traceViolations,
    mock_calls: mockCalls,
  };
};

const shimHasCapExceeded = (shimLogJsonl: string): boolean => {
  for (const line of shimLogJsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).outcome === "cap_exceeded"
      ) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
};

const mergeUsage = (
  turns: TranscriptTurn[],
): Record<string, unknown> | undefined => {
  const numericTotals: Record<string, number> = {};
  let hasUsage = false;

  for (const turn of turns) {
    if (!turn.usage) continue;
    hasUsage = true;
    for (const [key, value] of Object.entries(turn.usage)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        numericTotals[key] = (numericTotals[key] ?? 0) + value;
      }
    }
  }

  if (!hasUsage) return undefined;
  return numericTotals;
};

const runCodexTurn = (params: {
  turn: number;
  userMessage: string;
  history: Array<{ user_message: string; assistant_response: string }>;
  threadId: string | null;
  workspace: CaseWorkspace;
  codexHomeDir: string;
  shimCallCap: number;
  timeoutMs: number;
}): Promise<CaseExecResult> => {
  const env = buildIsolatedCaseEnv(params.workspace, {
    CODEX_HOME: params.codexHomeDir,
    CHEZMOI_SHIM_CALL_CAP: String(params.shimCallCap),
  });

  if (params.turn === 1) {
    return spawnWithTimeout(
      [
        "codex",
        "exec",
        "--json",
        "-C",
        params.workspace.workDir,
        "-s",
        "workspace-write",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        params.userMessage,
      ],
      params.workspace.workDir,
      env,
      params.timeoutMs,
    );
  }

  if (params.threadId) {
    return spawnWithTimeout(
      [
        "codex",
        "exec",
        "resume",
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        params.threadId,
        "-",
      ],
      params.workspace.workDir,
      env,
      params.timeoutMs,
      params.userMessage,
    );
  }

  return spawnWithTimeout(
    [
      "codex",
      "exec",
      "--json",
      "-C",
      params.workspace.workDir,
      "-s",
      "workspace-write",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "-",
    ],
    params.workspace.workDir,
    env,
    params.timeoutMs,
    buildTranscriptReplayPrompt(params.history, params.userMessage),
  );
};

const runAgyTurn = async (params: {
  turn: number;
  userMessage: string;
  history: Array<{ user_message: string; assistant_response: string }>;
  sessionId: string | null;
  workspace: CaseWorkspace;
  agyHomeDir: string;
  shimCallCap: number;
  timeoutMs: number;
}): Promise<CaseExecResult> => {
  const env = buildIsolatedCaseEnv(params.workspace, {
    HOME: params.agyHomeDir,
    CHEZMOI_SHIM_CALL_CAP: String(params.shimCallCap),
  });

  if (params.turn === 1) {
    return spawnWithTimeout(
      [
        "agy",
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
        `--print=${params.userMessage}`,
      ],
      params.workspace.workDir,
      env,
      params.timeoutMs,
    );
  }

  const resumeArgs = params.sessionId
    ? ["--conversation", params.sessionId]
    : ["--continue"];

  const resumed = await spawnWithTimeout(
    [
      "agy",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      ...resumeArgs,
      `--print=${params.userMessage}`,
    ],
    params.workspace.workDir,
    env,
    params.timeoutMs,
  );

  const authHit =
    AUTH_OR_RATE_LIMIT_RE.test(resumed.stderr) ||
    AUTH_OR_RATE_LIMIT_RE.test(resumed.rawJsonl);
  if (resumed.exitCode === 0 || resumed.timedOut || authHit) {
    return resumed;
  }

  // Fallback to bounded transcript-replay prompt when session resume fails under isolated HOME.
  return spawnWithTimeout(
    [
      "agy",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      `--print=${buildTranscriptReplayPrompt(params.history, params.userMessage)}`,
    ],
    params.workspace.workDir,
    env,
    params.timeoutMs,
  );
};

const runSimulatedCase = async (params: {
  testCase: TestCase;
  simulation: SimulationConfig;
  runRoot: string;
  runOutDir: string;
  simAuthHome: string;
  options: SimulateOptions;
  simHarness: HarnessName;
  invokeSimulator: StructuredSimulatorInvoker;
}): Promise<{
  caseResult: CaseResult;
  modelId: string | null;
  abortedEarly: boolean;
  abortReason: string | null;
}> => {
  const { testCase, simulation, options, simHarness } = params;
  const effectiveMaxTurns =
    options.maxTurns !== undefined
      ? clampMaxTurns(options.maxTurns)
      : clampMaxTurns(simulation.max_turns);
  const shimCallCap = simulation.shim_call_cap;

  const workspace = prepareCaseWorkspace(
    params.runRoot,
    testCase,
    options.skillsDir,
  );
  const caseAuthHome = prepareIsolatedHarnessAuth(
    workspace.caseDir,
    options.harness,
  );
  const simCaseRoot = join(workspace.caseDir, "sim");
  mkdirSync(simCaseRoot, { recursive: true, mode: 0o700 });
  chmodSync(simCaseRoot, 0o700);

  const caseStartedAt = Date.now();
  const turns: TranscriptTurn[] = [];
  const turnTraces: NormalizedTrace[] = [];
  const history: Array<{ user_message: string; assistant_response: string }> =
    [];
  let allEventsJsonl = "";
  let allStderr = "";
  let codexThreadId: string | null = null;
  let agySessionId: string | null = null;
  let detectedModelId: string | null = null;
  let nextUserMessage = testCase.input.user_prompt;
  let previousAssistantReply = "";
  let stopReason: SimulationStopReason = "max_turns_reached";
  let stopDetail: string | undefined;
  let abortedEarly = false;
  let abortReason: string | null = null;

  for (let turn = 1; turn <= effectiveMaxTurns; turn++) {
    const remainingCaseMs =
      options.caseTimeoutMs - (Date.now() - caseStartedAt);
    if (remainingCaseMs <= 0) {
      stopReason = "execution_failed";
      stopDetail = `Case wall-clock timeout (${options.caseTimeoutMs}ms) exceeded`;
      break;
    }

    const turnTimeoutMs = Math.min(options.timeoutMs, remainingCaseMs);
    const execResult =
      options.harness === "codex"
        ? await runCodexTurn({
            turn,
            userMessage: nextUserMessage,
            history,
            threadId: codexThreadId,
            workspace,
            codexHomeDir: caseAuthHome,
            shimCallCap,
            timeoutMs: turnTimeoutMs,
          })
        : await runAgyTurn({
            turn,
            userMessage: nextUserMessage,
            history,
            sessionId: agySessionId,
            workspace,
            agyHomeDir: caseAuthHome,
            shimCallCap,
            timeoutMs: turnTimeoutMs,
          });

    if (execResult.rawJsonl.trim().length > 0) {
      allEventsJsonl += `${execResult.rawJsonl.trimEnd()}\n`;
    }
    if (execResult.stderr.trim().length > 0) {
      allStderr += `${execResult.stderr.trimEnd()}\n`;
    }

    const traceOpts = {
      metaDir: workspace.metaDir,
      repoEvalsDir: options.evalsDir,
      durationMs: execResult.durationMs,
    };
    const parsed =
      options.harness === "codex"
        ? parseCodexTrace(execResult.rawJsonl, "", traceOpts)
        : parseAgyTrace(execResult.rawJsonl, "", traceOpts);

    if (parsed.modelId && !detectedModelId) {
      detectedModelId = parsed.modelId;
    }
    if (options.harness === "codex" && !codexThreadId) {
      codexThreadId = extractCodexThreadId(execResult.rawJsonl);
    }
    if (options.harness === "agy" && !agySessionId) {
      agySessionId = extractAgySessionId(execResult.rawJsonl);
    }

    turnTraces.push(parsed.trace);

    const turnRecord: TranscriptTurn = {
      turn,
      user_message: nextUserMessage,
      assistant_response: parsed.trace.final_response,
      duration_ms: execResult.durationMs,
      exit_code: execResult.exitCode,
      timed_out: execResult.timedOut,
      ...(parsed.usage ? { usage: parsed.usage } : {}),
    };
    turns.push(turnRecord);
    history.push({
      user_message: nextUserMessage,
      assistant_response: parsed.trace.final_response,
    });

    // 1. Auth or rate-limit hit
    const stderrAuthError = AUTH_OR_RATE_LIMIT_RE.test(execResult.stderr)
      ? execResult.stderr.trim()
      : null;
    const authError = parsed.authOrRateLimitError ?? stderrAuthError;
    if (authError) {
      stopReason = "auth_or_rate_limit";
      stopDetail = authError;
      abortedEarly = true;
      abortReason = authError;
      break;
    }

    // 2. Execution failure (turn timeout, case timeout, or non-zero exit)
    if (execResult.timedOut) {
      stopReason = "execution_failed";
      stopDetail = `Turn ${turn} timed out after ${turnTimeoutMs}ms`;
      break;
    }
    if (Date.now() - caseStartedAt >= options.caseTimeoutMs) {
      stopReason = "execution_failed";
      stopDetail = `Case wall-clock timeout (${options.caseTimeoutMs}ms) exceeded`;
      break;
    }
    if (execResult.exitCode !== 0) {
      stopReason = "execution_failed";
      stopDetail = `${options.harness} exited with code ${execResult.exitCode} on turn ${turn}`;
      break;
    }

    // 3. Isolation or shim violation
    const currentShimLog = existsSync(workspace.shimLogPath)
      ? readFileSync(workspace.shimLogPath, "utf-8")
      : "";
    if (shimHasCapExceeded(currentShimLog)) {
      stopReason = "cap_exceeded";
      stopDetail = `chezmoi shim call cap (${shimCallCap}) exceeded`;
      break;
    }
    if (parsed.trace.trace_violations.length > 0) {
      stopReason = "trace_violation";
      stopDetail = parsed.trace.trace_violations.join("; ");
      break;
    }

    // 6. Stall guard (checked before next simulator turn)
    if (
      turn >= 2 &&
      parsed.trace.final_response.trim() === previousAssistantReply.trim()
    ) {
      stopReason = "stalled";
      stopDetail = `Assistant repeated turn ${turn - 1} response verbatim`;
      break;
    }

    // 4. Turn ceiling reached
    if (turn >= effectiveMaxTurns) {
      stopReason = "max_turns_reached";
      stopDetail = `Reached max_turns (${effectiveMaxTurns})`;
      break;
    }

    // 5. Call user simulator in isolated empty sim/ workspace
    const simRemainingMs = options.caseTimeoutMs - (Date.now() - caseStartedAt);
    if (simRemainingMs <= 0) {
      stopReason = "execution_failed";
      stopDetail = `Case wall-clock timeout (${options.caseTimeoutMs}ms) exceeded`;
      break;
    }

    const simPrompt = buildSimulatorPrompt({
      simulation,
      currentTurn: turn,
      maxTurns: effectiveMaxTurns,
      turns: history,
    });
    const simTurnWorkDir = join(simCaseRoot, `turn-${turn}`);
    const simResult = await params.invokeSimulator({
      harness: simHarness,
      prompt: simPrompt,
      schema: SimulatorTurnSchema,
      authHomeDir: params.simAuthHome,
      workDir: simTurnWorkDir,
      timeoutMs: Math.min(SIMULATOR_TIMEOUT_MS, simRemainingMs),
      ...(options.simModel ? { model: options.simModel } : {}),
    });

    if (simResult.authOrRateLimitError) {
      stopReason = "auth_or_rate_limit";
      stopDetail = simResult.authOrRateLimitError;
      abortedEarly = true;
      abortReason = simResult.authOrRateLimitError;
      break;
    }

    if (!simResult.ok || !simResult.data) {
      stopReason = "simulator_stuck";
      stopDetail =
        simResult.error ?? "Simulator failed to produce a valid turn";
      break;
    }

    turnRecord.simulator_decision = {
      ...simResult.data,
      duration_ms: simResult.durationMs,
      ...(simResult.usage ? { usage: simResult.usage } : {}),
    };

    if (simResult.data.status === "goal_reached") {
      stopReason = "goal_reached";
      stopDetail = simResult.data.reason;
      break;
    }
    if (
      simResult.data.status === "stuck" ||
      simResult.data.message.trim().length === 0
    ) {
      stopReason = "simulator_stuck";
      stopDetail = simResult.data.reason;
      break;
    }

    previousAssistantReply = parsed.trace.final_response;
    nextUserMessage = simResult.data.message;
  }

  const totalDurationMs = Date.now() - caseStartedAt;
  const finalShimLog = existsSync(workspace.shimLogPath)
    ? readFileSync(workspace.shimLogPath, "utf-8")
    : "";

  const aggregatedTrace = aggregateNormalizedTrace({
    turnTraces,
    shimLogJsonl: finalShimLog,
    shimCallCap,
  });

  const transcript: SimulationTranscript = {
    schema_version: "1",
    case_id: testCase.id,
    harness: options.harness,
    sim_harness: simHarness,
    stop_reason: stopReason,
    ...(stopDetail ? { stop_detail: stopDetail } : {}),
    total_turns: turns.length,
    total_duration_ms: totalDurationMs,
    turns,
  };

  const safeId = testCase.id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const caseArtifactDir = join(params.runOutDir, "cases", safeId);
  mkdirSync(caseArtifactDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(caseArtifactDir, `${options.harness}-events.jsonl`),
      allEventsJsonl,
      "utf-8",
    ),
    writeFile(
      join(caseArtifactDir, `${options.harness}-stderr.log`),
      allStderr,
      "utf-8",
    ),
    writeFile(join(caseArtifactDir, "shim.jsonl"), finalShimLog, "utf-8"),
    writeFile(
      join(caseArtifactDir, "transcript.json"),
      JSON.stringify(transcript, null, 2),
      "utf-8",
    ),
  ]);

  const evaluation = evaluateTrace(aggregatedTrace, testCase);
  let passed = evaluation.passed;
  let reason = evaluation.reason;

  if (
    stopReason === "auth_or_rate_limit" ||
    stopReason === "execution_failed" ||
    stopReason === "trace_violation" ||
    stopReason === "cap_exceeded"
  ) {
    passed = false;
    reason = stopDetail ?? stopReason;
  }

  const usage = mergeUsage(turns);
  const caseResult: CaseResult = {
    id: testCase.id,
    name: testCase.name,
    eval_type: testCase.eval_type,
    target_skill: testCase.target_skill,
    passed,
    ...(reason ? { reason } : {}),
    duration_ms: totalDurationMs,
    assertions: evaluation.assertions,
    trace: aggregatedTrace,
    ...(usage ? { usage } : {}),
  };

  return {
    caseResult,
    modelId: detectedModelId,
    abortedEarly,
    abortReason,
  };
};

/**
 * Executes multi-turn simulated user evaluations and writes `summary.json` plus per-case `transcript.json`.
 */
export const runSimulationSuite = async (
  cases: TestCase[],
  corpusFiles: string[],
  options: SimulateOptions,
): Promise<SimulateSuiteResult> => {
  if (options.harness !== "codex" && options.harness !== "agy") {
    throw new ConfigError(`Unsupported harness: "${options.harness}".`);
  }
  const simHarness = options.simHarness ?? options.harness;
  if (simHarness !== "codex" && simHarness !== "agy") {
    throw new ConfigError(`Unsupported sim-harness: "${simHarness}".`);
  }

  const simulationCases = cases.filter(
    (testCase): testCase is TestCase & { simulation: SimulationConfig } =>
      testCase.simulation !== undefined,
  );

  if (options.dryRun) {
    return {
      dryRun: true,
      dryRunCases: simulationCases.map((testCase) => ({
        id: testCase.id,
        target_skill: testCase.target_skill,
        eval_type: testCase.eval_type,
        max_turns:
          options.maxTurns !== undefined
            ? clampMaxTurns(options.maxTurns)
            : clampMaxTurns(testCase.simulation.max_turns),
        shim_call_cap: testCase.simulation.shim_call_cap,
        name: testCase.name,
      })),
    };
  }

  const { harness_version: harnessVersion } = checkHarnessPreflight(
    options.harness,
  );
  if (!options.invokeSimulator) {
    checkHarnessPreflight(simHarness, { structured: true });
  }

  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const runRoot = `/tmp/chezmoi-sim-${runId}`;
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  chmodSync(runRoot, 0o700);

  const simAuthRoot = join(runRoot, "sim_auth");
  mkdirSync(simAuthRoot, { recursive: true, mode: 0o700 });
  const simAuthHome = options.invokeSimulator
    ? simAuthRoot
    : prepareIsolatedHarnessAuth(simAuthRoot, simHarness);

  const cleanup = (): void => {
    if (!options.keepWorkdir) {
      rmSync(runRoot, { recursive: true, force: true });
    }
  };

  const onSigInt = (): void => {
    cleanup();
    process.exit(130);
  };
  const onSigTerm = (): void => {
    cleanup();
    process.exit(143);
  };

  if (!options.keepWorkdir) {
    process.once("exit", cleanup);
    process.once("SIGINT", onSigInt);
    process.once("SIGTERM", onSigTerm);
  }

  const timestamp = new Date().toISOString();
  const runDirName = timestamp.replace(/[:.]/g, "-");
  const runOutDir = join(options.outDir, "runs", runDirName);
  mkdirSync(runOutDir, { recursive: true });

  const results: CaseResult[] = [];
  let abortedEarly = false;
  let abortReason: string | null = null;
  let detectedModelId: string | null = null;
  const invokeSimulator = options.invokeSimulator ?? invokeStructuredHarness;

  try {
    for (const testCase of simulationCases) {
      const outcome = await runSimulatedCase({
        testCase,
        simulation: testCase.simulation,
        runRoot,
        runOutDir,
        simAuthHome,
        options,
        simHarness,
        invokeSimulator,
      });

      results.push(outcome.caseResult);
      if (outcome.modelId && !detectedModelId) {
        detectedModelId = outcome.modelId;
      }
      if (outcome.abortedEarly) {
        abortedEarly = true;
        abortReason = outcome.abortReason;
        break;
      }
    }
  } finally {
    if (!options.keepWorkdir) {
      process.removeListener("exit", cleanup);
      process.removeListener("SIGINT", onSigInt);
      process.removeListener("SIGTERM", onSigTerm);
      cleanup();
    }
  }

  const summary = buildRunSummary({
    timestamp,
    harnessName: options.harness,
    harnessVersion,
    modelId: detectedModelId,
    skillsDir: options.skillsDir,
    evalsDir: options.evalsDir,
    corpusFiles,
    abortedEarly,
    abortReason,
    cases: results,
    ...(options.runScope !== undefined ? { runScope: options.runScope } : {}),
    ...(options.skippedCases !== undefined
      ? { skippedCases: options.skippedCases }
      : {}),
  });

  await writeFile(
    join(runOutDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8",
  );

  return {
    dryRun: false,
    summary,
    runOutDir,
  };
};
