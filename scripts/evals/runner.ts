import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import {
  corpusHash,
  evaluateTrace,
  listedFilesRecursive,
  type MockCallOutcome,
  type MockCallRecord,
  type NormalizedTrace,
  type TestCase,
} from "./corpus.ts";

export class ConfigError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface RunOptions {
  harness: string;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
  timeoutMs: number;
  keepWorkdir: boolean;
}

export interface CaseResult {
  id: string;
  name: string;
  eval_type: TestCase["eval_type"];
  target_skill: string;
  passed: boolean;
  reason?: string;
  duration_ms: number;
  assertions: Array<{ name: string; passed: boolean; reason?: string }>;
  trace: NormalizedTrace;
  usage?: Record<string, unknown>;
}

export interface RunSummary {
  schema_version: "1";
  timestamp: string;
  commit_sha: string;
  git_dirty: boolean;
  harness_name: "codex";
  harness_version: string;
  model_id: string | null;
  skill_source_sha256: string;
  corpus_sha256: string;
  aborted_early: boolean;
  abort_reason: string | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  failed_case_ids: string[];
  unmocked_fallback_count: number;
  cases: CaseResult[];
}

export interface ParsedCodexTrace {
  trace: NormalizedTrace;
  authOrRateLimitError: string | null;
  usage?: Record<string, unknown>;
  modelId?: string | null;
}

const AUTH_OR_RATE_LIMIT_RE =
  /401|unauthorized|invalid.*auth|rate.?limit|429|quota/i;
const SKILL_DISCOVERY_RE = /\.agents\/skills\/([^/\s"'`]+)\/SKILL\.md/g;
const REFERENCE_READ_RE =
  /\.agents\/skills\/[^/\s"'`]+\/(references\/[^\s"'`]+\.md)/g;

const runSyncCommand = (
  cmd: string[],
): { exitCode: number; stdout: string; stderr: string } => {
  try {
    const proc = Bun.spawnSync(cmd, {
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: proc.exitCode,
      stdout: new TextDecoder().decode(proc.stdout),
      stderr: new TextDecoder().decode(proc.stderr),
    };
  } catch (error) {
    throw new ConfigError(
      `Failed to execute "${cmd.join(" ")}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Verifies that the `codex` CLI is installed and supports required isolation flags.
 */
export const checkCodexPreflight = (): { harness_version: string } => {
  const versionResult = runSyncCommand(["codex", "--version"]);
  if (versionResult.exitCode !== 0) {
    throw new ConfigError(
      `codex --version failed (exit ${versionResult.exitCode}): ${versionResult.stderr.trim() || versionResult.stdout.trim()}`,
    );
  }

  const helpResult = runSyncCommand(["codex", "exec", "--help"]);
  if (helpResult.exitCode !== 0) {
    throw new ConfigError(
      `codex exec --help failed (exit ${helpResult.exitCode}): ${helpResult.stderr.trim() || helpResult.stdout.trim()}`,
    );
  }

  const helpText = `${helpResult.stdout}\n${helpResult.stderr}`;
  for (const flag of ["--ignore-user-config", "--ignore-rules"]) {
    if (!helpText.includes(flag)) {
      throw new ConfigError(
        `codex exec --help does not advertise required flag ${flag}.`,
      );
    }
  }

  const harnessVersion = versionResult.stdout.trim() || "unknown";
  return { harness_version: harnessVersion };
};

/**
 * Resolves and verifies the existence of the Codex `auth.json` credential file.
 */
export const resolveAuthJsonPath = (): string => {
  const codexHome = process.env.CODEX_HOME?.trim();
  const baseHome = process.env.HOME?.trim() || homedir();
  const authPath = codexHome
    ? join(codexHome, "auth.json")
    : join(baseHome, ".codex", "auth.json");

  if (!existsSync(authPath)) {
    throw new ConfigError(`Codex auth.json not found at ${authPath}.`);
  }
  return authPath;
};

/**
 * Generates the standalone Bun script used as the `chezmoi` shim binary.
 */
export const generateChezmoiShimScript = (): string => `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "fs";

const CALL_CAP = 25;
const rulesPath = process.env.CHEZMOI_SHIM_RULES;
const logPath = process.env.CHEZMOI_SHIM_LOG;

if (!rulesPath || !logPath) {
  process.stderr.write("chezmoi shim: CHEZMOI_SHIM_RULES and CHEZMOI_SHIM_LOG must be set\\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const timestamp = new Date().toISOString();

const appendLog = (outcome: string, exitCode: number) => {
  const entry = JSON.stringify({
    timestamp,
    argv,
    outcome,
    exit_code: exitCode,
  });
  appendFileSync(logPath, entry + "\\n", "utf-8");
};

const existingLines = readFileSync(logPath, "utf-8")
  .split(/\\r?\\n/)
  .filter((line) => line.trim().length > 0);

if (existingLines.length >= CALL_CAP) {
  appendLog("cap_exceeded", 1);
  process.stderr.write("chezmoi shim: call cap (25) exceeded\\n");
  process.exit(1);
}

interface Rule {
  match_args?: string[];
  match_regex?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

const rules = JSON.parse(readFileSync(rulesPath, "utf-8")) as Rule[];

let matchedRule: Rule | undefined = rules.find(
  (rule) =>
    Array.isArray(rule.match_args) &&
    JSON.stringify(rule.match_args) === JSON.stringify(argv),
);

if (!matchedRule) {
  const joined = argv.join(" ");
  matchedRule = rules.find(
    (rule) =>
      typeof rule.match_regex === "string" &&
      new RegExp(rule.match_regex).test(joined),
  );
}

if (matchedRule) {
  const exitCode = matchedRule.exit_code ?? 0;
  appendLog("matched_case", exitCode);
  if (matchedRule.stdout) process.stdout.write(matchedRule.stdout);
  if (matchedRule.stderr) process.stderr.write(matchedRule.stderr);
  process.exit(exitCode);
}

const subcommand = argv[0];
const defaults: Record<string, { stdout: string; exitCode: number }> = {
  "--version": { stdout: "chezmoi version v2.62.0 (mocked)\\n", exitCode: 0 },
  "--help": { stdout: "chezmoi - manage your dotfiles (mocked)\\n", exitCode: 0 },
  "-h": { stdout: "chezmoi - manage your dotfiles (mocked)\\n", exitCode: 0 },
  "source-path": {
    stdout: (process.env.CHEZMOI_SOURCE_DIR ?? "~/.local/share/chezmoi") + "\\n",
    exitCode: 0,
  },
  "dump-config": { stdout: "{}\\n", exitCode: 0 },
  data: { stdout: '{"chezmoi":{"os":"linux","arch":"amd64"}}\\n', exitCode: 0 },
  managed: { stdout: "", exitCode: 0 },
  status: { stdout: "", exitCode: 0 },
};

const defaultEntry = subcommand ? defaults[subcommand] : undefined;
if (defaultEntry) {
  appendLog("matched_default", defaultEntry.exitCode);
  if (defaultEntry.stdout) process.stdout.write(defaultEntry.stdout);
  process.exit(defaultEntry.exitCode);
}

appendLog("unmocked_fallback", 1);
process.stderr.write("chezmoi shim: unmocked invocation: " + argv.join(" ") + "\\n");
process.exit(1);
`;

const materializeContextFile = (workDir: string, relPath: string): void => {
  if (!relPath || isAbsolute(relPath) || relPath.startsWith("\\")) {
    throw new ConfigError(
      `Invalid context_files path "${relPath}": must be a relative path.`,
    );
  }
  const resolvedWork = resolve(workDir);
  const resolvedTarget = resolve(resolvedWork, relPath);
  const rel = relative(resolvedWork, resolvedTarget);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new ConfigError(
      `Invalid context_files path "${relPath}": escapes workspace directory.`,
    );
  }
  mkdirSync(dirname(resolvedTarget), { recursive: true });
  writeFileSync(resolvedTarget, "", "utf-8");
};

export interface CaseWorkspace {
  caseDir: string;
  workDir: string;
  metaDir: string;
  metaBinDir: string;
  rulesPath: string;
  shimLogPath: string;
}

/**
 * Prepares an isolated per-case workspace with skills, context files, and the `chezmoi` shim.
 */
export const prepareCaseWorkspace = (
  runRoot: string,
  testCase: TestCase,
  skillsDir: string,
): CaseWorkspace => {
  const safeId = testCase.id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const caseDir = join(runRoot, "cases", safeId);
  const workDir = join(caseDir, "work");
  const metaDir = join(caseDir, "meta");
  const metaBinDir = join(metaDir, "bin");
  const rulesPath = join(metaDir, "rules.json");
  const shimLogPath = join(metaDir, "shim.jsonl");
  const shimBinPath = join(metaBinDir, "chezmoi");

  mkdirSync(join(workDir, ".agents"), { recursive: true });
  cpSync(skillsDir, join(workDir, ".agents", "skills"), { recursive: true });

  for (const contextFile of testCase.input.context_files ?? []) {
    materializeContextFile(workDir, contextFile);
  }

  mkdirSync(metaBinDir, { recursive: true });
  writeFileSync(
    rulesPath,
    JSON.stringify(testCase.mock_responses ?? [], null, 2),
    "utf-8",
  );
  writeFileSync(shimLogPath, "", "utf-8");
  writeFileSync(shimBinPath, generateChezmoiShimScript(), "utf-8");
  chmodSync(shimBinPath, 0o755);

  return {
    caseDir,
    workDir,
    metaDir,
    metaBinDir,
    rulesPath,
    shimLogPath,
  };
};

const addUnique = (target: string[], value: string): void => {
  if (!target.includes(value)) {
    target.push(value);
  }
};

const checkForbiddenReference = (
  value: string,
  metaDir: string,
  repoEvalsDir: string,
  violations: string[],
  label: string,
): void => {
  if (metaDir && value.includes(metaDir)) {
    addUnique(violations, `${label} referenced meta directory (${metaDir})`);
  }
  if (repoEvalsDir && value.includes(repoEvalsDir)) {
    addUnique(
      violations,
      `${label} referenced evals directory (${repoEvalsDir})`,
    );
  }
};

/**
 * Parses `codex exec --json` JSONL events and `shim.jsonl` into a `NormalizedTrace`.
 */
export const parseCodexTrace = (
  rawJsonl: string,
  shimLogJsonl: string,
  opts: { metaDir: string; repoEvalsDir: string; durationMs: number },
): ParsedCodexTrace => {
  const discoveredSkills: string[] = [];
  const referencesRead: string[] = [];
  const commandsInvoked: string[] = [];
  const traceViolations: string[] = [];
  const mockCalls: MockCallRecord[] = [];
  let finalResponse = "";
  let authOrRateLimitError: string | null = null;
  let usage: Record<string, unknown> | undefined;
  let modelId: string | null = null;

  for (const line of rawJsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") continue;
      event = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const eventType = event.type;
    if (eventType === "thread.started" && typeof event.model === "string") {
      modelId = event.model;
    } else if (eventType === "item.completed") {
      const item = event.item;
      if (!item || typeof item !== "object") continue;
      const itemObj = item as Record<string, unknown>;

      if (
        itemObj.type === "agent_message" &&
        typeof itemObj.text === "string"
      ) {
        finalResponse = itemObj.text;
      } else if (
        itemObj.type === "command_execution" &&
        typeof itemObj.command === "string"
      ) {
        const command = itemObj.command;
        commandsInvoked.push(command);

        for (const match of command.matchAll(SKILL_DISCOVERY_RE)) {
          if (match[1]) addUnique(discoveredSkills, match[1]);
        }
        for (const match of command.matchAll(REFERENCE_READ_RE)) {
          if (match[1]) addUnique(referencesRead, match[1]);
        }
        checkForbiddenReference(
          command,
          opts.metaDir,
          opts.repoEvalsDir,
          traceViolations,
          "Command",
        );
      } else if (
        itemObj.type === "file_change" &&
        Array.isArray(itemObj.changes)
      ) {
        for (const change of itemObj.changes) {
          if (
            change &&
            typeof change === "object" &&
            typeof (change as Record<string, unknown>).path === "string"
          ) {
            checkForbiddenReference(
              (change as Record<string, unknown>).path as string,
              opts.metaDir,
              opts.repoEvalsDir,
              traceViolations,
              "File change",
            );
          }
        }
      }
    } else if (
      eventType === "turn.completed" &&
      event.usage &&
      typeof event.usage === "object"
    ) {
      usage = event.usage as Record<string, unknown>;
    } else if (eventType === "error" || eventType === "turn.failed") {
      const errObj =
        event.error && typeof event.error === "object"
          ? (event.error as Record<string, unknown>)
          : undefined;
      const message =
        typeof event.message === "string"
          ? event.message
          : typeof errObj?.message === "string"
            ? errObj.message
            : JSON.stringify(event);
      if (AUTH_OR_RATE_LIMIT_RE.test(message)) {
        authOrRateLimitError = message;
      }
    }
  }

  for (const line of shimLogJsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") continue;
      entry = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const argv = Array.isArray(entry.argv)
      ? entry.argv.filter((arg): arg is string => typeof arg === "string")
      : [];
    const outcome = (
      typeof entry.outcome === "string" ? entry.outcome : "unmocked_fallback"
    ) as MockCallOutcome;
    const exitCode = typeof entry.exit_code === "number" ? entry.exit_code : 1;

    mockCalls.push({
      command: "chezmoi",
      args: argv,
      outcome,
      exit_code: exitCode,
    });

    const invoked = `chezmoi ${argv.join(" ")}`.trim();
    addUnique(commandsInvoked, invoked);

    if (outcome === "cap_exceeded") {
      addUnique(traceViolations, "chezmoi shim call cap (25) exceeded");
    }
  }

  return {
    trace: {
      discovered_skills: discoveredSkills,
      references_read: referencesRead,
      commands_invoked: commandsInvoked,
      final_response: finalResponse,
      trace_violations: traceViolations,
      mock_calls: mockCalls,
    },
    authOrRateLimitError,
    ...(usage ? { usage } : {}),
    ...(modelId !== null ? { modelId } : {}),
  };
};

const getGitMetadata = (): { commitSha: string; gitDirty: boolean } => {
  try {
    const shaProc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const commitSha =
      shaProc.exitCode === 0
        ? new TextDecoder().decode(shaProc.stdout).trim()
        : "unknown";
    const statusProc = Bun.spawnSync(["git", "status", "--porcelain"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const gitDirty =
      statusProc.exitCode === 0
        ? new TextDecoder().decode(statusProc.stdout).trim().length > 0
        : false;
    return { commitSha, gitDirty };
  } catch {
    return { commitSha: "unknown", gitDirty: false };
  }
};

const runCodexCase = async (
  testCase: TestCase,
  workspace: CaseWorkspace,
  codexHomeDir: string,
  timeoutMs: number,
): Promise<{
  rawJsonl: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}> => {
  const startedAt = Date.now();
  const proc = Bun.spawn(
    [
      "codex",
      "exec",
      "--json",
      "-C",
      workspace.workDir,
      "-s",
      "workspace-write",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      testCase.input.user_prompt,
    ],
    {
      cwd: workspace.workDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        CODEX_HOME: codexHomeDir,
        HOME: workspace.workDir,
        XDG_CONFIG_HOME: join(workspace.caseDir, "xdg_config"),
        XDG_DATA_HOME: join(workspace.caseDir, "xdg_data"),
        CHEZMOI_CONFIG_FILE: join(workspace.caseDir, "chezmoi.toml"),
        CHEZMOI_SOURCE_DIR: join(workspace.workDir, "source"),
        CHEZMOI_SHIM_RULES: workspace.rulesPath,
        CHEZMOI_SHIM_LOG: workspace.shimLogPath,
        PATH: `${workspace.metaBinDir}:${process.env.PATH ?? ""}`,
      },
    },
  );

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [rawJsonl, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  return {
    rawJsonl,
    stderr,
    exitCode,
    timedOut,
    durationMs: Date.now() - startedAt,
  };
};

/**
 * Builds the `RunSummary` object from completed case results and repository metadata.
 */
export const buildRunSummary = (params: {
  timestamp: string;
  harnessVersion: string;
  modelId: string | null;
  skillsDir: string;
  evalsDir: string;
  corpusFiles: string[];
  abortedEarly: boolean;
  abortReason: string | null;
  cases: CaseResult[];
}): RunSummary => {
  const { commitSha, gitDirty } = getGitMetadata();
  const skillFiles = listedFilesRecursive(params.skillsDir, "");
  const skillSourceSha256 = corpusHash(skillFiles, params.skillsDir);
  const corpusSha256 = corpusHash(params.corpusFiles, params.evalsDir);

  const failedCases = params.cases.filter((c) => !c.passed);
  const unmockedFallbackCount = params.cases.reduce(
    (sum, c) =>
      sum +
      (c.trace.mock_calls?.filter((m) => m.outcome === "unmocked_fallback")
        .length ?? 0),
    0,
  );

  return {
    schema_version: "1",
    timestamp: params.timestamp,
    commit_sha: commitSha,
    git_dirty: gitDirty,
    harness_name: "codex",
    harness_version: params.harnessVersion,
    model_id: params.modelId,
    skill_source_sha256: skillSourceSha256,
    corpus_sha256: corpusSha256,
    aborted_early: params.abortedEarly,
    abort_reason: params.abortReason,
    total_cases: params.cases.length,
    passed_cases: params.cases.length - failedCases.length,
    failed_cases: failedCases.length,
    failed_case_ids: failedCases.map((c) => c.id),
    unmocked_fallback_count: unmockedFallbackCount,
    cases: params.cases,
  };
};

/**
 * Executes the selected eval cases against the Codex harness and writes run artifacts.
 */
export const runEvalSuite = async (
  cases: TestCase[],
  corpusFiles: string[],
  options: RunOptions,
): Promise<{ summary: RunSummary; runOutDir: string }> => {
  if (options.harness !== "codex") {
    throw new ConfigError(`Unsupported harness: "${options.harness}".`);
  }

  const { harness_version: harnessVersion } = checkCodexPreflight();
  const authPath = resolveAuthJsonPath();

  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const runRoot = `/tmp/chezmoi-evals-${runId}`;
  const codexHomeDir = join(runRoot, "codex_home");
  mkdirSync(codexHomeDir, { recursive: true, mode: 0o700 });
  chmodSync(runRoot, 0o700);
  chmodSync(codexHomeDir, 0o700);

  const targetAuthPath = join(codexHomeDir, "auth.json");
  cpSync(authPath, targetAuthPath);
  chmodSync(targetAuthPath, 0o600);

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

  try {
    for (const testCase of cases) {
      const workspace = prepareCaseWorkspace(
        runRoot,
        testCase,
        options.skillsDir,
      );
      const execResult = await runCodexCase(
        testCase,
        workspace,
        codexHomeDir,
        options.timeoutMs,
      );

      const shimLogJsonl = existsSync(workspace.shimLogPath)
        ? readFileSync(workspace.shimLogPath, "utf-8")
        : "";

      const caseArtifactDir = join(
        runOutDir,
        "cases",
        testCase.id.replace(/[^a-zA-Z0-9._-]/g, "_"),
      );
      mkdirSync(caseArtifactDir, { recursive: true });
      await Promise.all([
        writeFile(
          join(caseArtifactDir, "codex-events.jsonl"),
          execResult.rawJsonl,
          "utf-8",
        ),
        writeFile(
          join(caseArtifactDir, "codex-stderr.log"),
          execResult.stderr,
          "utf-8",
        ),
        writeFile(join(caseArtifactDir, "shim.jsonl"), shimLogJsonl, "utf-8"),
      ]);

      const parsed = parseCodexTrace(execResult.rawJsonl, shimLogJsonl, {
        metaDir: workspace.metaDir,
        repoEvalsDir: options.evalsDir,
        durationMs: execResult.durationMs,
      });

      if (parsed.modelId && !detectedModelId) {
        detectedModelId = parsed.modelId;
      }

      const evaluation = evaluateTrace(parsed.trace, testCase);
      let passed = evaluation.passed;
      let reason = evaluation.reason;

      if (execResult.timedOut) {
        passed = false;
        reason = `Timed out after ${options.timeoutMs}ms`;
      } else if (execResult.exitCode !== 0 && passed) {
        passed = false;
        reason = `codex exec exited with code ${execResult.exitCode}`;
      }

      results.push({
        id: testCase.id,
        name: testCase.name,
        eval_type: testCase.eval_type,
        target_skill: testCase.target_skill,
        passed,
        ...(reason ? { reason } : {}),
        duration_ms: execResult.durationMs,
        assertions: evaluation.assertions,
        trace: parsed.trace,
        ...(parsed.usage ? { usage: parsed.usage } : {}),
      });

      const stderrAuthError = AUTH_OR_RATE_LIMIT_RE.test(execResult.stderr)
        ? execResult.stderr.trim()
        : null;
      const authError = parsed.authOrRateLimitError ?? stderrAuthError;

      if (authError) {
        abortedEarly = true;
        abortReason = authError;
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
    harnessVersion,
    modelId: detectedModelId,
    skillsDir: options.skillsDir,
    evalsDir: options.evalsDir,
    corpusFiles,
    abortedEarly,
    abortReason,
    cases: results,
  });

  await writeFile(
    join(runOutDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8",
  );

  return { summary, runOutDir };
};
