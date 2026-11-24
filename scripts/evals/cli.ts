import { Command, CommanderError } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { filterCases, loadCorpus, type TestCase } from "./corpus.ts";
import {
  appendHistoryRecord,
  buildHistoryRecord,
  type JudgeHistorySummary,
  validateHistoryFile,
} from "./history.ts";
import {
  CALIBRATION_MIN_AGREEMENT,
  runJudgeCalibration,
  runJudgeSuite,
  toJudgeHistorySummary,
} from "./judge.ts";
import {
  compareAgainstBaseline,
  ConfigError,
  getGitMetadata,
  type HarnessName,
  loadBaselineSummary,
  runEvalSuite,
  type RunScope,
} from "./runner.ts";
import { runSimulationSuite } from "./simulator.ts";

interface RunCliOptions {
  harness: string;
  skill?: string;
  case?: string;
  smoke?: boolean;
  origin?: string;
  dryRun?: boolean;
  baseline?: string;
  timeout: string;
  keepWorkdir?: boolean;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
  recordHistory?: boolean;
  historyFile: string;
  judge?: boolean;
  judgeHarness: string;
  judgeModel?: string;
  judgeRuns: string;
  judgeTimeout: string;
  includeMultiTurn?: boolean;
}

interface SimulateCliOptions {
  harness: string;
  simHarness?: string;
  simModel?: string;
  skill?: string;
  case?: string;
  maxTurns?: string;
  timeout: string;
  caseTimeout: string;
  judge?: boolean;
  judgeHarness: string;
  judgeModel?: string;
  judgeRuns: string;
  judgeTimeout: string;
  dryRun?: boolean;
  keepWorkdir?: boolean;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
}

interface JudgeCliOptions {
  run?: string;
  judgeHarness: string;
  judgeModel?: string;
  rubric?: string;
  skill?: string;
  case?: string;
  onlyPassed?: boolean;
  judgeRuns: string;
  maxCases?: string;
  timeout: string;
  calibrate?: boolean;
  calibrationFile: string;
  dryRun?: boolean;
  keepWorkdir?: boolean;
  evalsDir: string;
  skillsDir: string;
}

interface ValidateCliOptions {
  evalsDir: string;
  historyFile?: string;
}

const parseHarness = (raw: string, flagName: string): HarnessName => {
  if (raw !== "codex" && raw !== "agy") {
    throw new ConfigError(
      `Unsupported ${flagName} "${raw}". Supported harnesses: codex, agy.`,
    );
  }
  return raw;
};

const parseJudgeRuns = (raw: string): 1 | 3 => {
  if (raw !== "1" && raw !== "3") {
    throw new ConfigError(`Invalid --judge-runs "${raw}": must be 1 or 3.`);
  }
  return raw === "3" ? 3 : 1;
};

const parsePositiveInt = (raw: string, flagName: string): number => {
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(
      `Invalid ${flagName} "${raw}": must be a positive integer.`,
    );
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigError(
      `Invalid ${flagName} "${raw}": must be a positive integer.`,
    );
  }
  return value;
};

/**
 * Runs the eval CLI with the given argv and returns the process exit code.
 */
export const runCli = async (argv: string[]): Promise<number> => {
  let exitCode = 0;

  const program = new Command();
  program
    .name("chezmoi-evals")
    .description("Run and validate chezmoi skill harness evaluations")
    .exitOverride();

  program
    .command("validate")
    .description("Validate eval corpus JSON files against the schema")
    .option("--evals-dir <dir>", "Path to eval corpus directory", "tests/evals")
    .option(
      "--history-file <path>",
      "Path to eval history ledger (defaults to <evals-dir>/history.jsonl)",
    )
    .action(async (opts: ValidateCliOptions) => {
      try {
        const { cases, files } = await loadCorpus(opts.evalsDir);
        console.log(
          `Validated ${cases.length} case(s) across ${files.length} file(s).`,
        );
        const historyFile =
          opts.historyFile ?? join(opts.evalsDir, "history.jsonl");
        if (existsSync(historyFile)) {
          const { count } = validateHistoryFile(historyFile);
          console.log(
            `Validated ${count} history record(s) in ${historyFile}.`,
          );
        }
        exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        exitCode = 2;
      }
    });

  program
    .command("run")
    .description("Run eval cases against a coding agent harness")
    .option("--harness <name>", "Harness to execute (codex or agy)", "codex")
    .option("--skill <skill>", "Filter cases by target_skill")
    .option("--case <id>", "Filter cases by case id")
    .option("--smoke", "Run only smoke-tagged cases")
    .option(
      "--origin <origin>",
      "Filter cases by origin (contrived or distilled)",
    )
    .option("--dry-run", "List matched cases without running the harness")
    .option(
      "--baseline <summary.json>",
      "Compare run results against a baseline summary.json",
    )
    .option("--timeout <ms>", "Per-case timeout in milliseconds", "90000")
    .option("--keep-workdir", "Preserve isolated temporary workdir after run")
    .option("--evals-dir <dir>", "Path to eval corpus directory", "tests/evals")
    .option("--skills-dir <dir>", "Path to skills directory", "skills")
    .option(
      "--out-dir <dir>",
      "Path to evaluation artifacts directory",
      "eval_results",
    )
    .option(
      "--record-history",
      "Append an aggregate entry to tests/evals/history.jsonl",
    )
    .option(
      "--history-file <path>",
      "Path to eval history ledger",
      "tests/evals/history.jsonl",
    )
    .option("--judge", "Run post-hoc LLM-as-a-judge grading after completion")
    .option(
      "--judge-harness <name>",
      "Harness used for --judge (codex or agy)",
      "codex",
    )
    .option("--judge-model <model>", "Model override for --judge")
    .option("--judge-runs <n>", "Repeat judge grading (1 or 3)", "1")
    .option(
      "--judge-timeout <ms>",
      "Per-case judge timeout in milliseconds",
      "60000",
    )
    .option(
      "--include-multi-turn",
      "Include multi-turn simulation cases in this run",
    )
    .action(async (opts: RunCliOptions) => {
      const harness = parseHarness(opts.harness, "harness");
      const judgeHarness = parseHarness(opts.judgeHarness, "judge-harness");
      const judgeRuns = parseJudgeRuns(opts.judgeRuns);
      const judgeTimeoutMs = parsePositiveInt(
        opts.judgeTimeout,
        "--judge-timeout",
      );

      let origin: TestCase["origin"] | undefined;
      if (opts.origin !== undefined) {
        if (opts.origin !== "contrived" && opts.origin !== "distilled") {
          throw new ConfigError(
            `Unsupported origin "${opts.origin}". Supported origins: contrived, distilled.`,
          );
        }
        origin = opts.origin;
      }

      const timeoutMs = parsePositiveInt(opts.timeout, "--timeout");

      if (
        opts.recordHistory &&
        (opts.skill !== undefined ||
          opts.case !== undefined ||
          opts.origin !== undefined)
      ) {
        throw new ConfigError(
          "--record-history cannot be combined with --skill, --case, or --origin.",
        );
      }

      if (opts.recordHistory) {
        const { commitSha } = getGitMetadata();
        if (commitSha === "unknown") {
          throw new ConfigError(
            "--record-history requires a valid git commit (git rev-parse HEAD failed).",
          );
        }
      }

      const baseline =
        opts.baseline !== undefined
          ? loadBaselineSummary(opts.baseline)
          : undefined;

      let cases;
      let files: string[];
      try {
        ({ cases, files } = await loadCorpus(opts.evalsDir));
      } catch (error) {
        throw new ConfigError(
          error instanceof Error ? error.message : String(error),
        );
      }

      const matched = filterCases(cases, {
        ...(opts.skill !== undefined ? { skill: opts.skill } : {}),
        ...(opts.case !== undefined ? { caseId: opts.case } : {}),
        ...(opts.smoke ? { smoke: true } : {}),
        ...(origin !== undefined ? { origin } : {}),
      }).filter((testCase) =>
        opts.includeMultiTurn ? true : testCase.simulation === undefined,
      );

      if (opts.dryRun) {
        console.log(`Matched ${matched.length} case(s):`);
        for (const testCase of matched) {
          console.log(
            `- ${testCase.id} [${testCase.eval_type}] (${testCase.target_skill}): ${testCase.name}`,
          );
        }
        exitCode = 0;
        return;
      }

      const runScope: RunScope =
        opts.skill !== undefined ||
        opts.case !== undefined ||
        opts.origin !== undefined
          ? "filtered"
          : opts.smoke
            ? "smoke"
            : "full";
      const skippedCases = Math.max(0, cases.length - matched.length);

      const singleTurnCases = matched.filter(
        (testCase) => testCase.simulation === undefined,
      );
      const simulationCases = matched.filter(
        (testCase) => testCase.simulation !== undefined,
      );

      let summary;
      let runOutDir;
      if (simulationCases.length > 0 && singleTurnCases.length === 0) {
        const simResult = await runSimulationSuite(simulationCases, files, {
          harness,
          evalsDir: opts.evalsDir,
          skillsDir: opts.skillsDir,
          outDir: opts.outDir,
          timeoutMs,
          caseTimeoutMs: Math.max(timeoutMs * 4, 300000),
          keepWorkdir: Boolean(opts.keepWorkdir),
          runScope,
          skippedCases,
        });
        summary = simResult.summary!;
        runOutDir = simResult.runOutDir!;
      } else {
        ({ summary, runOutDir } = await runEvalSuite(singleTurnCases, files, {
          harness,
          evalsDir: opts.evalsDir,
          skillsDir: opts.skillsDir,
          outDir: opts.outDir,
          timeoutMs,
          keepWorkdir: Boolean(opts.keepWorkdir),
          runScope,
          skippedCases,
        }));
        if (simulationCases.length > 0 && !summary.aborted_early) {
          const simResult = await runSimulationSuite(simulationCases, files, {
            harness,
            evalsDir: opts.evalsDir,
            skillsDir: opts.skillsDir,
            outDir: opts.outDir,
            timeoutMs,
            caseTimeoutMs: Math.max(timeoutMs * 4, 300000),
            keepWorkdir: Boolean(opts.keepWorkdir),
            runScope,
            skippedCases,
          });
          if (simResult.summary) {
            console.log(
              `Simulated ${simResult.summary.total_cases} case(s): ${simResult.summary.passed_cases} passed, ${simResult.summary.failed_cases} failed.`,
            );
            console.log(
              `Simulation artifacts written to ${simResult.runOutDir}`,
            );
            summary = {
              ...summary,
              total_cases: summary.total_cases + simResult.summary.total_cases,
              passed_cases:
                summary.passed_cases + simResult.summary.passed_cases,
              failed_cases:
                summary.failed_cases + simResult.summary.failed_cases,
              failed_case_ids: [
                ...summary.failed_case_ids,
                ...simResult.summary.failed_case_ids,
              ],
              unmocked_fallback_count:
                summary.unmocked_fallback_count +
                simResult.summary.unmocked_fallback_count,
              aborted_early:
                summary.aborted_early || simResult.summary.aborted_early,
              abort_reason:
                summary.abort_reason ?? simResult.summary.abort_reason,
              cases: [...summary.cases, ...simResult.summary.cases],
            };
          }
        }
      }

      console.log(
        `Completed ${summary.total_cases} case(s): ${summary.passed_cases} passed, ${summary.failed_cases} failed.`,
      );
      console.log(`Artifacts written to ${runOutDir}`);
      if (summary.aborted_early) {
        console.error(`Aborted early: ${summary.abort_reason}`);
      }

      let judgeHistorySummary: JudgeHistorySummary | undefined;
      let judgeFailed = false;
      if (opts.judge) {
        if (summary.aborted_early) {
          console.warn(
            "Skipping post-hoc judge because the run aborted early.",
          );
        } else {
          const judgeResult = await runJudgeSuite({
            runDir: runOutDir,
            judgeHarness,
            ...(opts.judgeModel ? { judgeModel: opts.judgeModel } : {}),
            judgeRuns,
            timeoutMs: judgeTimeoutMs,
            keepWorkdir: Boolean(opts.keepWorkdir),
            evalsDir: opts.evalsDir,
            skillsDir: opts.skillsDir,
          });
          if (judgeResult.summary) {
            judgeHistorySummary = toJudgeHistorySummary(judgeResult.summary);
            console.log(
              `Judge completed ${judgeResult.summary.total_judged} case(s): ${judgeResult.summary.passed_judged} passed, ${judgeResult.summary.failed_judged} failed, ${judgeResult.summary.error_judged} error(s).`,
            );
            if (judgeResult.summaryPath) {
              console.log(
                `Judge summary written to ${judgeResult.summaryPath}`,
              );
            }
            if (
              judgeResult.summary.failed_judged > 0 ||
              judgeResult.summary.error_judged > 0 ||
              judgeResult.summary.aborted_early
            ) {
              judgeFailed = true;
            }
          }
        }
      }

      if (opts.recordHistory) {
        if (summary.aborted_early) {
          console.warn(
            "Skipping history recording because the run aborted early.",
          );
        } else {
          if (summary.git_dirty) {
            console.warn(
              "Warning: git working tree is dirty; commit skill/corpus edits for clean history snapshots.",
            );
          }
          const record = buildHistoryRecord({
            summary,
            ...(judgeHistorySummary ? { judge: judgeHistorySummary } : {}),
            corpusTotalCases: cases.length,
          });
          const { appended, recordId } = appendHistoryRecord(
            opts.historyFile,
            record,
          );
          if (appended) {
            console.log(
              `Recorded history entry ${recordId.slice(0, 12)} to ${opts.historyFile}.`,
            );
          }
        }
      }

      if (baseline) {
        const diff = compareAgainstBaseline(summary, baseline);
        for (const warning of diff.drift_warnings) {
          console.warn(`Warning: ${warning}`);
        }
        console.log(
          `Baseline diff: ${diff.new_failures.length} new failure(s), ${diff.new_passes.length} new pass(es), ${diff.unchanged_failures.length} unchanged failure(s).`,
        );
        if (diff.new_failures.length > 0) {
          console.log(`  new_failures: ${diff.new_failures.join(", ")}`);
        }
        if (diff.new_passes.length > 0) {
          console.log(`  new_passes: ${diff.new_passes.join(", ")}`);
        }
        if (diff.unchanged_failures.length > 0) {
          console.log(
            `  unchanged_failures: ${diff.unchanged_failures.join(", ")}`,
          );
        }
      }

      exitCode =
        summary.failed_cases > 0 || summary.aborted_early || judgeFailed
          ? 1
          : 0;
    });

  program
    .command("judge")
    .description("Run post-hoc LLM-as-a-judge rubric grading on a saved run")
    .option(
      "--run <dir>",
      "Path to an existing eval_results/runs/<timestamp> directory",
    )
    .option(
      "--judge-harness <name>",
      "Local harness used as judge (codex or agy)",
      "codex",
    )
    .option("--judge-model <model>", "Explicit model override for the judge")
    .option(
      "--rubric <file>",
      "Optional fallback RubricSchema JSON file for cases lacking expected.rubric",
    )
    .option("--skill <skill>", "Filter graded cases by target_skill")
    .option("--case <id>", "Filter graded cases by case ID")
    .option(
      "--only-passed",
      "Skip cases that already failed T2 deterministic assertions",
    )
    .option(
      "--judge-runs <n>",
      "Repeat grading (1 or 3) and take per-criterion majority vote",
      "1",
    )
    .option("--max-cases <n>", "Hard cap on judged cases in one invocation")
    .option("--timeout <ms>", "Per-case judge timeout in milliseconds", "60000")
    .option(
      "--calibrate",
      "Run judge against golden calibration fixture verdicts",
    )
    .option(
      "--calibration-file <path>",
      "Path to golden calibration fixture JSON",
      "tests/fixtures/judge_calibration.json",
    )
    .option(
      "--dry-run",
      "List cases eligible for judging without invoking any model",
    )
    .option("--keep-workdir", "Retain temporary isolated judge workspace")
    .option("--evals-dir <dir>", "Path to eval corpus directory", "tests/evals")
    .option("--skills-dir <dir>", "Path to skills directory", "skills")
    .action(async (opts: JudgeCliOptions) => {
      const judgeHarness = parseHarness(opts.judgeHarness, "judge-harness");
      const judgeRuns = parseJudgeRuns(opts.judgeRuns);
      const timeoutMs = parsePositiveInt(opts.timeout, "--timeout");
      const maxCases =
        opts.maxCases !== undefined
          ? parsePositiveInt(opts.maxCases, "--max-cases")
          : undefined;

      if (opts.calibrate) {
        const report = await runJudgeCalibration({
          calibrationFile: opts.calibrationFile,
          judgeHarness,
          ...(opts.judgeModel ? { judgeModel: opts.judgeModel } : {}),
          judgeRuns,
          timeoutMs,
          dryRun: Boolean(opts.dryRun),
          keepWorkdir: Boolean(opts.keepWorkdir),
          skillsDir: opts.skillsDir,
        });

        if (report.dryRun) {
          console.log(
            `Matched ${report.total_cases} calibration case(s) in ${opts.calibrationFile}:`,
          );
          for (const calCase of report.cases ?? []) {
            console.log(
              `- ${calCase.id} (${calCase.target_skill}): ${calCase.description}`,
            );
          }
          exitCode = 0;
          return;
        }

        const pct = (report.agreement_rate * 100).toFixed(1);
        const minPct = (CALIBRATION_MIN_AGREEMENT * 100).toFixed(0);
        console.log(
          `Calibration agreement: ${report.agreement_count}/${report.total_cases} (${pct}%, required >= ${minPct}%), critical false-passes: ${report.critical_false_passes}.`,
        );
        if (report.aborted_early) {
          console.error(`Aborted early: ${report.abort_reason}`);
        }
        for (const mismatch of report.mismatches) {
          console.log(
            `- Mismatch ${mismatch.case_id}: expected=${mismatch.expected_passed} actual=${mismatch.actual_passed} status=${mismatch.verdict_status}${mismatch.critical_false_pass_criteria.length > 0 ? ` critical_false_pass=[${mismatch.critical_false_pass_criteria.join(", ")}]` : ""}${mismatch.error ? ` (${mismatch.error})` : ""}`,
          );
        }
        exitCode = report.passed ? 0 : 1;
        return;
      }

      if (!opts.run) {
        throw new ConfigError(
          "--run <dir> is required unless --calibrate is specified.",
        );
      }

      const result = await runJudgeSuite({
        runDir: opts.run,
        judgeHarness,
        ...(opts.judgeModel ? { judgeModel: opts.judgeModel } : {}),
        ...(opts.rubric ? { rubricPath: opts.rubric } : {}),
        ...(opts.skill ? { skill: opts.skill } : {}),
        ...(opts.case ? { caseId: opts.case } : {}),
        onlyPassed: Boolean(opts.onlyPassed),
        judgeRuns,
        ...(maxCases !== undefined ? { maxCases } : {}),
        timeoutMs,
        dryRun: Boolean(opts.dryRun),
        keepWorkdir: Boolean(opts.keepWorkdir),
        evalsDir: opts.evalsDir,
        skillsDir: opts.skillsDir,
      });

      if (result.dryRun) {
        const dryCases = result.dryRunCases ?? [];
        console.log(`Matched ${dryCases.length} judgeable case(s):`);
        for (const c of dryCases) {
          console.log(
            `- ${c.case_id} (${c.target_skill}, t2_passed=${c.t2_passed}, criteria=${c.criteria_count})`,
          );
        }
        exitCode = 0;
        return;
      }

      const summary = result.summary!;
      console.log(
        `Judged ${summary.total_judged} case(s): ${summary.passed_judged} passed, ${summary.failed_judged} failed, ${summary.error_judged} error(s).`,
      );
      if (result.summaryPath) {
        console.log(`Judge summary written to ${result.summaryPath}`);
      }
      if (summary.aborted_early) {
        console.error(`Aborted early: ${summary.abort_reason}`);
      }

      exitCode =
        summary.failed_judged > 0 ||
        summary.error_judged > 0 ||
        summary.aborted_early
          ? 1
          : 0;
    });

  program
    .command("simulate")
    .description("Run multi-turn simulated user evaluations")
    .option("--harness <name>", "Harness under test (codex or agy)", "codex")
    .option(
      "--sim-harness <name>",
      "Harness driving the user simulator (defaults to --harness)",
    )
    .option("--sim-model <model>", "Optional model override for the simulator")
    .option("--skill <skill>", "Filter simulation cases by target_skill")
    .option("--case <id>", "Filter simulation cases by case ID")
    .option("--max-turns <n>", "Override maximum turns (clamped to 2..8)")
    .option(
      "--timeout <ms>",
      "Per-turn timeout for the evaluated agent in milliseconds",
      "90000",
    )
    .option(
      "--case-timeout <ms>",
      "Total wall-clock timeout per case in milliseconds",
      "300000",
    )
    .option(
      "--judge",
      "Run post-hoc LLM-as-a-judge grading after simulation completes",
    )
    .option(
      "--judge-harness <name>",
      "Harness used for --judge (codex or agy)",
      "codex",
    )
    .option("--judge-model <model>", "Model override for --judge")
    .option("--judge-runs <n>", "Repeat judge grading (1 or 3)", "1")
    .option(
      "--judge-timeout <ms>",
      "Per-case judge timeout in milliseconds",
      "60000",
    )
    .option(
      "--dry-run",
      "List matched simulation cases and turn budgets without model calls",
    )
    .option(
      "--keep-workdir",
      "Retain temporary workspaces and per-case session directories",
    )
    .option("--evals-dir <dir>", "Path to eval corpus directory", "tests/evals")
    .option("--skills-dir <dir>", "Path to skills directory", "skills")
    .option(
      "--out-dir <dir>",
      "Path to evaluation artifacts directory",
      "eval_results",
    )
    .action(async (opts: SimulateCliOptions) => {
      const harness = parseHarness(opts.harness, "harness");
      const simHarness = opts.simHarness
        ? parseHarness(opts.simHarness, "sim-harness")
        : harness;
      const judgeHarness = parseHarness(opts.judgeHarness, "judge-harness");
      const judgeRuns = parseJudgeRuns(opts.judgeRuns);
      const timeoutMs = parsePositiveInt(opts.timeout, "--timeout");
      const caseTimeoutMs = parsePositiveInt(
        opts.caseTimeout,
        "--case-timeout",
      );
      const judgeTimeoutMs = parsePositiveInt(
        opts.judgeTimeout,
        "--judge-timeout",
      );
      const maxTurns =
        opts.maxTurns !== undefined
          ? parsePositiveInt(opts.maxTurns, "--max-turns")
          : undefined;

      let cases: TestCase[];
      let files: string[];
      try {
        ({ cases, files } = await loadCorpus(opts.evalsDir));
      } catch (error) {
        throw new ConfigError(
          error instanceof Error ? error.message : String(error),
        );
      }

      const matched = filterCases(cases, {
        ...(opts.skill !== undefined ? { skill: opts.skill } : {}),
        ...(opts.case !== undefined ? { caseId: opts.case } : {}),
      }).filter((testCase) => testCase.simulation !== undefined);

      const runScope: RunScope =
        opts.skill !== undefined || opts.case !== undefined
          ? "filtered"
          : "full";
      const skippedCases = Math.max(0, cases.length - matched.length);

      const result = await runSimulationSuite(matched, files, {
        harness,
        simHarness,
        ...(opts.simModel ? { simModel: opts.simModel } : {}),
        ...(maxTurns !== undefined ? { maxTurns } : {}),
        timeoutMs,
        caseTimeoutMs,
        dryRun: Boolean(opts.dryRun),
        keepWorkdir: Boolean(opts.keepWorkdir),
        evalsDir: opts.evalsDir,
        skillsDir: opts.skillsDir,
        outDir: opts.outDir,
        runScope,
        skippedCases,
      });

      if (result.dryRun) {
        const dryCases = result.dryRunCases ?? [];
        console.log(`Matched ${dryCases.length} simulation case(s):`);
        for (const c of dryCases) {
          console.log(
            `- ${c.id} [${c.eval_type}] (${c.target_skill}, max_turns=${c.max_turns}, shim_call_cap=${c.shim_call_cap}): ${c.name}`,
          );
        }
        exitCode = 0;
        return;
      }

      const summary = result.summary!;
      const runOutDir = result.runOutDir!;
      console.log(
        `Simulated ${summary.total_cases} case(s): ${summary.passed_cases} passed, ${summary.failed_cases} failed.`,
      );
      console.log(`Artifacts written to ${runOutDir}`);
      if (summary.aborted_early) {
        console.error(`Aborted early: ${summary.abort_reason}`);
      }

      let judgeFailed = false;
      if (opts.judge) {
        if (summary.aborted_early) {
          console.warn(
            "Skipping post-hoc judge because the simulation aborted early.",
          );
        } else {
          const judgeResult = await runJudgeSuite({
            runDir: runOutDir,
            judgeHarness,
            ...(opts.judgeModel ? { judgeModel: opts.judgeModel } : {}),
            judgeRuns,
            timeoutMs: judgeTimeoutMs,
            keepWorkdir: Boolean(opts.keepWorkdir),
            evalsDir: opts.evalsDir,
            skillsDir: opts.skillsDir,
          });
          if (judgeResult.summary) {
            console.log(
              `Judge completed ${judgeResult.summary.total_judged} case(s): ${judgeResult.summary.passed_judged} passed, ${judgeResult.summary.failed_judged} failed, ${judgeResult.summary.error_judged} error(s).`,
            );
            if (judgeResult.summaryPath) {
              console.log(
                `Judge summary written to ${judgeResult.summaryPath}`,
              );
            }
            if (
              judgeResult.summary.failed_judged > 0 ||
              judgeResult.summary.error_judged > 0 ||
              judgeResult.summary.aborted_early
            ) {
              judgeFailed = true;
            }
          }
        }
      }

      exitCode =
        summary.failed_cases > 0 || summary.aborted_early || judgeFailed
          ? 1
          : 0;
    });

  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed") {
        return 0;
      }
      return 2;
    }
    if (error instanceof ConfigError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (import.meta.main) {
  const code = await runCli(process.argv);
  process.exit(code);
}
