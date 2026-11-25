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
import { z } from "zod";
import {
  corpusHash,
  evaluateTrace,
  listedFilesRecursive,
  TestCaseSchema,
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

export type HarnessName = "codex" | "agy";

export type RunScope = "full" | "smoke" | "filtered";

export interface RunOptions {
  harness: HarnessName;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
  timeoutMs: number;
  keepWorkdir: boolean;
  runScope?: RunScope;
  skippedCases?: number;
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
  harness_name: HarnessName;
  harness_version: string;
  model_id: string | null;
  skill_source_sha256: string;
  corpus_sha256: string;
  aborted_early: boolean;
  abort_reason: string | null;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases?: number;
  run_scope?: RunScope;
  failed_case_ids: string[];
  unmocked_fallback_count: number;
  cases: CaseResult[];
}

export interface BaselineComparison {
  new_failures: string[];
  new_passes: string[];
  unchanged_failures: string[];
  drift_warnings: string[];
}

export interface ParsedHarnessTrace {
  trace: NormalizedTrace;
  authOrRateLimitError: string | null;
  usage?: Record<string, unknown>;
  modelId?: string | null;
}

export type ParsedCodexTrace = ParsedHarnessTrace;

export const AUTH_OR_RATE_LIMIT_RE =
  /401|unauthorized|invalid.*auth|authentication.*(?:fail|required|timed out)|rate.?limit|429|quota/i;
const SKILL_DISCOVERY_RE = /\.agents\/skills\/([^/\s"'`]+)\/SKILL\.md/g;
const REFERENCE_READ_RE =
  /\.agents\/skills\/[^/\s"'`]+\/(references\/[^\s"'`]+\.md)/g;

const runSyncCommand = (
  cmd: string[],
): { exitCode: number; stdout: string; stderr: string } => {
  try {
    const binary = cmd[0] ?? "";
    const executable =
      (binary ? Bun.which(binary, { PATH: process.env.PATH }) : null) ?? binary;
    const proc = Bun.spawnSync([executable, ...cmd.slice(1)], {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
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
export const checkCodexPreflight = (opts?: {
  structured?: boolean;
}): { harness_version: string } => {
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
  const requiredFlags = opts?.structured
    ? ["--ignore-user-config", "--ignore-rules", "--output-schema", "-o"]
    : ["--ignore-user-config", "--ignore-rules"];
  for (const flag of requiredFlags) {
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
 * Verifies that the `agy` CLI is installed and supports print-mode stream-json output.
 */
export const checkAgyPreflight = (opts?: {
  structured?: boolean;
}): { harness_version: string } => {
  const versionResult = runSyncCommand(["agy", "--version"]);
  if (versionResult.exitCode !== 0) {
    throw new ConfigError(
      `agy --version failed (exit ${versionResult.exitCode}): ${versionResult.stderr.trim() || versionResult.stdout.trim()}`,
    );
  }

  const helpResult = runSyncCommand(["agy", "--help"]);
  if (helpResult.exitCode !== 0) {
    throw new ConfigError(
      `agy --help failed (exit ${helpResult.exitCode}): ${helpResult.stderr.trim() || helpResult.stdout.trim()}`,
    );
  }

  const helpText = `${helpResult.stdout}\n${helpResult.stderr}`;
  const requiredFlags = opts?.structured
    ? [
        "--print",
        "--output-format",
        "--json-schema",
        "--disable-slash-commands",
        "--sandbox",
      ]
    : ["--print", "--output-format"];
  for (const flag of requiredFlags) {
    if (!helpText.includes(flag)) {
      throw new ConfigError(
        `agy --help does not advertise required flag ${flag}.`,
      );
    }
  }

  const harnessVersion = versionResult.stdout.trim() || "unknown";
  return { harness_version: harnessVersion };
};

/**
 * Runs harness CLI preflight checks for the specified harness.
 */
export const checkHarnessPreflight = (
  harness: HarnessName,
  opts?: { structured?: boolean },
): { harness_version: string } =>
  harness === "codex" ? checkCodexPreflight(opts) : checkAgyPreflight(opts);

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
 * Resolves and verifies the existence of the Antigravity OAuth token file.
 */
export const resolveAgyAuthTokenPath = (): string => {
  const baseHome = process.env.HOME?.trim() || homedir();
  const tokenPath = join(
    baseHome,
    ".gemini",
    "antigravity-cli",
    "antigravity-oauth-token",
  );

  if (!existsSync(tokenPath)) {
    throw new ConfigError(`Antigravity OAuth token not found at ${tokenPath}.`);
  }
  return tokenPath;
};

/**
 * Creates a `0700` directory copying only the isolated OAuth credential for `codex` or `agy`.
 */
export const prepareIsolatedHarnessAuth = (
  baseDir: string,
  harness: HarnessName,
): string => {
  if (harness === "codex") {
    const authPath = resolveAuthJsonPath();
    const codexHomeDir = join(baseDir, "codex_home");
    mkdirSync(codexHomeDir, { recursive: true, mode: 0o700 });
    chmodSync(codexHomeDir, 0o700);

    const targetAuthPath = join(codexHomeDir, "auth.json");
    cpSync(authPath, targetAuthPath);
    chmodSync(targetAuthPath, 0o600);
    return codexHomeDir;
  }

  const tokenPath = resolveAgyAuthTokenPath();
  const agyHomeDir = join(baseDir, "agy_home");
  const agyCliDir = join(agyHomeDir, ".gemini", "antigravity-cli");
  mkdirSync(agyCliDir, { recursive: true, mode: 0o700 });
  chmodSync(agyHomeDir, 0o700);

  const targetTokenPath = join(agyCliDir, "antigravity-oauth-token");
  cpSync(tokenPath, targetTokenPath);
  chmodSync(targetTokenPath, 0o600);
  return agyHomeDir;
};

/**
 * Generates the standalone Bun script used as the `chezmoi` shim binary.
 */
export const generateChezmoiShimScript = (): string => `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "fs";

const rawCap = process.env.CHEZMOI_SHIM_CALL_CAP;
const parsedCap = rawCap ? Number.parseInt(rawCap, 10) : 25;
const CALL_CAP = Number.isSafeInteger(parsedCap) && parsedCap > 0 ? parsedCap : 25;
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
  process.stderr.write(\`chezmoi shim: call cap (\${CALL_CAP}) exceeded\\n\`);
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

const recordSkillAndReferenceMatches = (
  value: string,
  discoveredSkills: string[],
  referencesRead: string[],
): void => {
  for (const match of value.matchAll(SKILL_DISCOVERY_RE)) {
    if (match[1]) addUnique(discoveredSkills, match[1]);
  }
  for (const match of value.matchAll(REFERENCE_READ_RE)) {
    if (match[1]) addUnique(referencesRead, match[1]);
  }
};

export const parseShimLog = (
  shimLogJsonl: string,
  commandsInvoked: string[],
  traceViolations: string[],
  mockCalls: MockCallRecord[],
  shimCallCap = 25,
): void => {
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
      addUnique(
        traceViolations,
        `chezmoi shim call cap (${shimCallCap}) exceeded`,
      );
    }
  }
};

/**
 * Parses `codex exec --json` JSONL events and `shim.jsonl` into a `NormalizedTrace`.
 */
export const parseCodexTrace = (
  rawJsonl: string,
  shimLogJsonl: string,
  opts: { metaDir: string; repoEvalsDir: string; durationMs: number },
): ParsedHarnessTrace => {
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
        recordSkillAndReferenceMatches(
          command,
          discoveredSkills,
          referencesRead,
        );
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

  parseShimLog(shimLogJsonl, commandsInvoked, traceViolations, mockCalls);

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

const AGY_PATH_PARAM_KEYS = [
  "Path",
  "AbsolutePath",
  "DirectoryPath",
  "SearchPath",
  "TargetFile",
] as const;

/**
 * Parses `agy --output-format stream-json` NDJSON events and `shim.jsonl` into a `NormalizedTrace`.
 */
export const parseAgyTrace = (
  rawJsonl: string,
  shimLogJsonl: string,
  opts: { metaDir: string; repoEvalsDir: string; durationMs: number },
): ParsedHarnessTrace => {
  const discoveredSkills: string[] = [];
  const referencesRead: string[] = [];
  const commandsInvoked: string[] = [];
  const traceViolations: string[] = [];
  const mockCalls: MockCallRecord[] = [];
  let finalResponse = "";
  let streamedResponse = "";
  let authOrRateLimitError: string | null = null;
  let usage: Record<string, unknown> | undefined;

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

    const eventType = event.event;
    if (
      eventType === "step_update" &&
      event.step_update &&
      typeof event.step_update === "object"
    ) {
      const step = event.step_update as Record<string, unknown>;
      if (step.step_type === "agent_response") {
        if (typeof step.text_delta === "string") {
          streamedResponse += step.text_delta;
        }
        if (step.usage && typeof step.usage === "object") {
          usage = step.usage as Record<string, unknown>;
        }
      } else if (
        step.step_type === "tool" &&
        step.state === "DONE" &&
        step.tool_info &&
        typeof step.tool_info === "object"
      ) {
        const toolInfo = step.tool_info as Record<string, unknown>;
        const toolName =
          typeof step.tool_name === "string"
            ? step.tool_name
            : typeof toolInfo.name === "string"
              ? toolInfo.name
              : "";
        const params =
          toolInfo.parameters && typeof toolInfo.parameters === "object"
            ? (toolInfo.parameters as Record<string, unknown>)
            : {};

        if (
          toolName === "run_command" &&
          typeof params.CommandLine === "string"
        ) {
          const command = params.CommandLine;
          commandsInvoked.push(command);
          recordSkillAndReferenceMatches(
            command,
            discoveredSkills,
            referencesRead,
          );
          checkForbiddenReference(
            command,
            opts.metaDir,
            opts.repoEvalsDir,
            traceViolations,
            "Command",
          );
        } else {
          for (const key of AGY_PATH_PARAM_KEYS) {
            const val = params[key];
            if (typeof val !== "string") continue;
            if (
              toolName === "read_file" ||
              toolName === "view_file" ||
              toolName === "list_dir" ||
              toolName === "find_by_name" ||
              toolName === "grep_search"
            ) {
              recordSkillAndReferenceMatches(
                val,
                discoveredSkills,
                referencesRead,
              );
            }
            checkForbiddenReference(
              val,
              opts.metaDir,
              opts.repoEvalsDir,
              traceViolations,
              `Tool ${toolName || "path"}`,
            );
          }
        }
      }
    } else if (
      eventType === "result" &&
      event.result &&
      typeof event.result === "object"
    ) {
      const res = event.result as Record<string, unknown>;
      if (typeof res.response === "string") {
        finalResponse = res.response;
      }
      if (res.usage && typeof res.usage === "object") {
        usage = res.usage as Record<string, unknown>;
      }
      if (res.status !== undefined && res.status !== "SUCCESS") {
        const message =
          typeof res.error === "string"
            ? res.error
            : typeof res.message === "string"
              ? res.message
              : JSON.stringify(res);
        if (AUTH_OR_RATE_LIMIT_RE.test(message)) {
          authOrRateLimitError = message;
        }
      }
    } else if (eventType === "error") {
      const message =
        typeof event.message === "string"
          ? event.message
          : JSON.stringify(event);
      if (AUTH_OR_RATE_LIMIT_RE.test(message)) {
        authOrRateLimitError = message;
      }
    }
  }

  parseShimLog(shimLogJsonl, commandsInvoked, traceViolations, mockCalls);

  return {
    trace: {
      discovered_skills: discoveredSkills,
      references_read: referencesRead,
      commands_invoked: commandsInvoked,
      final_response: finalResponse || streamedResponse,
      trace_violations: traceViolations,
      mock_calls: mockCalls,
    },
    authOrRateLimitError,
    ...(usage ? { usage } : {}),
  };
};

/**
 * Reads the current git commit SHA and working tree dirty state.
 */
export const getGitMetadata = (): { commitSha: string; gitDirty: boolean } => {
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

export interface CaseExecResult {
  rawJsonl: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

export const buildIsolatedCaseEnv = (
  workspace: CaseWorkspace,
  extraEnv: Record<string, string> = {},
): Record<string, string | undefined> => ({
  ...process.env,
  HOME: workspace.workDir,
  XDG_CONFIG_HOME: join(workspace.caseDir, "xdg_config"),
  XDG_DATA_HOME: join(workspace.caseDir, "xdg_data"),
  CHEZMOI_CONFIG_FILE: join(workspace.caseDir, "chezmoi.toml"),
  CHEZMOI_SOURCE_DIR: join(workspace.workDir, "source"),
  CHEZMOI_SHIM_RULES: workspace.rulesPath,
  CHEZMOI_SHIM_LOG: workspace.shimLogPath,
  PATH: `${workspace.metaBinDir}:${process.env.PATH ?? ""}`,
  ...extraEnv,
});

export const spawnWithTimeout = async (
  cmd: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
  stdinText?: string,
): Promise<CaseExecResult> => {
  const startedAt = Date.now();
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
    ...(stdinText !== undefined
      ? { stdin: new TextEncoder().encode(stdinText) }
      : {}),
  });

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

const runCodexCase = (
  testCase: TestCase,
  workspace: CaseWorkspace,
  codexHomeDir: string,
  timeoutMs: number,
): Promise<CaseExecResult> =>
  spawnWithTimeout(
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
    workspace.workDir,
    buildIsolatedCaseEnv(workspace, { CODEX_HOME: codexHomeDir }),
    timeoutMs,
  );

const runAgyCase = (
  testCase: TestCase,
  workspace: CaseWorkspace,
  agyHomeDir: string,
  timeoutMs: number,
): Promise<CaseExecResult> =>
  spawnWithTimeout(
    [
      "agy",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      `--print=${testCase.input.user_prompt}`,
    ],
    workspace.workDir,
    buildIsolatedCaseEnv(workspace, { HOME: agyHomeDir }),
    timeoutMs,
  );

/**
 * Strips optional Markdown code fences around a JSON payload.
 */
export const stripMarkdownCodeFence = (raw: string): string => {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(trimmed);
  return match ? (match[1] ?? "").trim() : trimmed;
};

export interface InvokeStructuredHarnessParams<T extends z.ZodType> {
  harness: HarnessName;
  prompt: string;
  schema: T;
  authHomeDir: string;
  workDir: string;
  timeoutMs: number;
  model?: string;
}

export interface InvokeStructuredHarnessResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  authOrRateLimitError: string | null;
  modelId: string | null;
  usage?: Record<string, unknown>;
  durationMs: number;
  rawOutput: string;
  stderr: string;
}

/**
 * Executes `codex` or `agy` in an empty read-only directory with a JSON schema and validates output via Zod.
 */
export const invokeStructuredHarness = async <T extends z.ZodType>(
  params: InvokeStructuredHarnessParams<T>,
): Promise<InvokeStructuredHarnessResult<z.infer<T>>> => {
  mkdirSync(params.workDir, { recursive: true, mode: 0o700 });
  chmodSync(params.workDir, 0o700);

  const metaDir = join(params.workDir, ".structured_meta");
  mkdirSync(metaDir, { recursive: true, mode: 0o700 });
  const schemaPath = join(metaDir, "schema.json");
  const outputPath = join(metaDir, "output.json");

  const jsonSchema = z.toJSONSchema(params.schema, { unrepresentable: "any" });
  writeFileSync(schemaPath, JSON.stringify(jsonSchema, null, 2), "utf-8");

  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: params.harness === "agy" ? params.authHomeDir : params.workDir,
    XDG_CONFIG_HOME: join(metaDir, "xdg_config"),
    XDG_DATA_HOME: join(metaDir, "xdg_data"),
    ...(params.harness === "codex" ? { CODEX_HOME: params.authHomeDir } : {}),
  };

  const cmd =
    params.harness === "codex"
      ? [
          "codex",
          "exec",
          "--json",
          "-C",
          params.workDir,
          "-s",
          "read-only",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "--output-schema",
          schemaPath,
          "-o",
          outputPath,
          ...(params.model ? ["-m", params.model] : []),
          "-",
        ]
      : [
          "agy",
          "--output-format",
          "stream-json",
          "--sandbox",
          "--disable-slash-commands",
          "--json-schema",
          schemaPath,
          ...(params.model ? ["--model", params.model] : []),
          `--print=${params.prompt}`,
        ];

  const execResult = await spawnWithTimeout(
    cmd,
    params.workDir,
    env,
    params.timeoutMs,
    params.harness === "codex" ? params.prompt : undefined,
  );

  const parsedTrace =
    params.harness === "codex"
      ? parseCodexTrace(execResult.rawJsonl, "", {
          metaDir,
          repoEvalsDir: metaDir,
          durationMs: execResult.durationMs,
        })
      : parseAgyTrace(execResult.rawJsonl, "", {
          metaDir,
          repoEvalsDir: metaDir,
          durationMs: execResult.durationMs,
        });

  const stderrAuthError = AUTH_OR_RATE_LIMIT_RE.test(execResult.stderr)
    ? execResult.stderr.trim()
    : null;
  const authOrRateLimitError =
    parsedTrace.authOrRateLimitError ?? stderrAuthError;

  const fileOutput =
    params.harness === "codex" && existsSync(outputPath)
      ? readFileSync(outputPath, "utf-8").trim()
      : "";
  const rawOutput = fileOutput || parsedTrace.trace.final_response;

  if (execResult.timedOut) {
    return {
      ok: false,
      error: `Timed out after ${params.timeoutMs}ms`,
      authOrRateLimitError,
      modelId: parsedTrace.modelId ?? params.model ?? null,
      ...(parsedTrace.usage ? { usage: parsedTrace.usage } : {}),
      durationMs: execResult.durationMs,
      rawOutput,
      stderr: execResult.stderr,
    };
  }

  if (execResult.exitCode !== 0 && !rawOutput) {
    return {
      ok: false,
      error: `${params.harness} exited with code ${execResult.exitCode}${execResult.stderr.trim() ? `: ${execResult.stderr.trim()}` : ""}`,
      authOrRateLimitError,
      modelId: parsedTrace.modelId ?? params.model ?? null,
      ...(parsedTrace.usage ? { usage: parsedTrace.usage } : {}),
      durationMs: execResult.durationMs,
      rawOutput,
      stderr: execResult.stderr,
    };
  }

  const stripped = stripMarkdownCodeFence(rawOutput);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripped);
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse structured JSON output: ${error instanceof Error ? error.message : String(error)}`,
      authOrRateLimitError,
      modelId: parsedTrace.modelId ?? params.model ?? null,
      ...(parsedTrace.usage ? { usage: parsedTrace.usage } : {}),
      durationMs: execResult.durationMs,
      rawOutput,
      stderr: execResult.stderr,
    };
  }

  const validation = params.schema.safeParse(parsedJson);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      error: `Structured output failed schema validation: ${issues}`,
      authOrRateLimitError,
      modelId: parsedTrace.modelId ?? params.model ?? null,
      ...(parsedTrace.usage ? { usage: parsedTrace.usage } : {}),
      durationMs: execResult.durationMs,
      rawOutput,
      stderr: execResult.stderr,
    };
  }

  return {
    ok: true,
    data: validation.data,
    authOrRateLimitError,
    modelId: parsedTrace.modelId ?? params.model ?? null,
    ...(parsedTrace.usage ? { usage: parsedTrace.usage } : {}),
    durationMs: execResult.durationMs,
    rawOutput,
    stderr: execResult.stderr,
  };
};

/**
 * Builds the `RunSummary` object from completed case results and repository metadata.
 */
export const buildRunSummary = (params: {
  timestamp: string;
  harnessName?: HarnessName;
  harnessVersion: string;
  modelId: string | null;
  skillsDir: string;
  evalsDir: string;
  corpusFiles: string[];
  abortedEarly: boolean;
  abortReason: string | null;
  cases: CaseResult[];
  runScope?: RunScope;
  skippedCases?: number;
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
    harness_name: params.harnessName ?? "codex",
    harness_version: params.harnessVersion,
    model_id: params.modelId,
    skill_source_sha256: skillSourceSha256,
    corpus_sha256: corpusSha256,
    aborted_early: params.abortedEarly,
    abort_reason: params.abortReason,
    total_cases: params.cases.length,
    passed_cases: params.cases.length - failedCases.length,
    failed_cases: failedCases.length,
    ...(params.skippedCases !== undefined
      ? { skipped_cases: params.skippedCases }
      : {}),
    ...(params.runScope !== undefined ? { run_scope: params.runScope } : {}),
    failed_case_ids: failedCases.map((c) => c.id),
    unmocked_fallback_count: unmockedFallbackCount,
    cases: params.cases,
  };
};

const baselineCaseSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  eval_type: TestCaseSchema.shape.eval_type,
  target_skill: z.string(),
  passed: z.boolean(),
  reason: z.string().optional(),
  duration_ms: z.number(),
  assertions: z.array(
    z.looseObject({
      name: z.string(),
      passed: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
  trace: z.looseObject({
    discovered_skills: z.array(z.string()),
    references_read: z.array(z.string()),
    commands_invoked: z.array(z.string()),
    final_response: z.string(),
    trace_violations: z.array(z.string()),
    mock_calls: z
      .array(
        z.looseObject({
          command: z.string(),
          args: z.array(z.string()),
          outcome: z.enum([
            "matched_case",
            "matched_default",
            "unmocked_fallback",
            "cap_exceeded",
          ]),
          exit_code: z.number(),
        }),
      )
      .optional(),
  }),
  usage: z.record(z.string(), z.unknown()).optional(),
});

const baselineSummarySchema = z.looseObject({
  schema_version: z.literal("1"),
  timestamp: z.string(),
  commit_sha: z.string(),
  git_dirty: z.boolean(),
  harness_name: z.enum(["codex", "agy"]),
  harness_version: z.string(),
  model_id: z.string().nullable(),
  skill_source_sha256: z.string(),
  corpus_sha256: z.string(),
  aborted_early: z.boolean(),
  abort_reason: z.string().nullable(),
  total_cases: z.number(),
  passed_cases: z.number(),
  failed_cases: z.number(),
  skipped_cases: z.number().optional(),
  run_scope: z.enum(["full", "smoke", "filtered"]).optional(),
  failed_case_ids: z.array(z.string()),
  unmocked_fallback_count: z.number(),
  cases: z.array(baselineCaseSchema),
});

/**
 * Loads and validates a baseline `summary.json` artifact for run comparison.
 */
export const loadBaselineSummary = (baselinePath: string): RunSummary => {
  if (!existsSync(baselinePath)) {
    throw new ConfigError(`Baseline summary not found at ${baselinePath}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(baselinePath, "utf-8"));
  } catch (error) {
    throw new ConfigError(
      `Failed to parse baseline summary ${baselinePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = baselineSummarySchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    const field = issue.path.reduce<string>(
      (path, key) =>
        typeof key === "number" ? `${path}[${key}]` : `${path}.${String(key)}`,
      "$",
    );
    throw new ConfigError(
      `Invalid baseline summary ${baselinePath} at ${field}: ${issue.message}.`,
    );
  }

  const ids = new Set<string>();
  for (const [index, { id }] of result.data.cases.entries()) {
    if (ids.has(id)) {
      throw new ConfigError(
        `Invalid baseline summary ${baselinePath} at $.cases[${index}].id: duplicate case ID ${JSON.stringify(id)}.`,
      );
    }
    ids.add(id);
  }

  return result.data;
};

/**
 * Compares a completed `RunSummary` against a baseline `RunSummary`.
 */
export const compareAgainstBaseline = (
  current: RunSummary,
  baseline: RunSummary,
): BaselineComparison => {
  const baselineMap = new Map<string, CaseResult>();
  for (const item of baseline.cases) {
    baselineMap.set(item.id, item);
  }

  const newFailures: string[] = [];
  const newPasses: string[] = [];
  const unchangedFailures: string[] = [];

  for (const item of current.cases) {
    const prev = baselineMap.get(item.id);
    if (!item.passed) {
      if (prev && !prev.passed) {
        unchangedFailures.push(item.id);
      } else {
        newFailures.push(item.id);
      }
    } else if (prev && !prev.passed) {
      newPasses.push(item.id);
    }
  }

  const driftWarnings: string[] = [];
  if (baseline.corpus_sha256 !== current.corpus_sha256) {
    driftWarnings.push(
      `corpus_sha256 drift: baseline=${baseline.corpus_sha256} current=${current.corpus_sha256}`,
    );
  }
  if (baseline.harness_name !== current.harness_name) {
    driftWarnings.push(
      `harness_name drift: baseline=${baseline.harness_name} current=${current.harness_name}`,
    );
  }
  if (baseline.harness_version !== current.harness_version) {
    driftWarnings.push(
      `harness_version drift: baseline=${baseline.harness_version} current=${current.harness_version}`,
    );
  }

  return {
    new_failures: newFailures,
    new_passes: newPasses,
    unchanged_failures: unchangedFailures,
    drift_warnings: driftWarnings,
  };
};

/**
 * Executes the selected eval cases against the configured harness and writes run artifacts.
 */
export const runEvalSuite = async (
  cases: TestCase[],
  corpusFiles: string[],
  options: RunOptions,
): Promise<{ summary: RunSummary; runOutDir: string }> => {
  if (options.harness !== "codex" && options.harness !== "agy") {
    throw new ConfigError(`Unsupported harness: "${options.harness}".`);
  }

  const { harness_version: harnessVersion } =
    options.harness === "codex" ? checkCodexPreflight() : checkAgyPreflight();

  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const runRoot = `/tmp/chezmoi-evals-${runId}`;
  mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  chmodSync(runRoot, 0o700);

  let codexHomeDir = "";
  let agyHomeDir = "";
  const authHomeDir = prepareIsolatedHarnessAuth(runRoot, options.harness);
  if (options.harness === "codex") {
    codexHomeDir = authHomeDir;
  } else {
    agyHomeDir = authHomeDir;
  }

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
      const execResult =
        options.harness === "codex"
          ? await runCodexCase(
              testCase,
              workspace,
              codexHomeDir,
              options.timeoutMs,
            )
          : await runAgyCase(
              testCase,
              workspace,
              agyHomeDir,
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
          join(caseArtifactDir, `${options.harness}-events.jsonl`),
          execResult.rawJsonl,
          "utf-8",
        ),
        writeFile(
          join(caseArtifactDir, `${options.harness}-stderr.log`),
          execResult.stderr,
          "utf-8",
        ),
        writeFile(join(caseArtifactDir, "shim.jsonl"), shimLogJsonl, "utf-8"),
      ]);

      const traceOpts = {
        metaDir: workspace.metaDir,
        repoEvalsDir: options.evalsDir,
        durationMs: execResult.durationMs,
      };
      const parsed =
        options.harness === "codex"
          ? parseCodexTrace(execResult.rawJsonl, shimLogJsonl, traceOpts)
          : parseAgyTrace(execResult.rawJsonl, shimLogJsonl, traceOpts);

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
        reason = `${options.harness} exited with code ${execResult.exitCode}`;
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

  return { summary, runOutDir };
};
