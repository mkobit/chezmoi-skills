import { Command, CommanderError } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { filterCases, loadCorpus, type TestCase } from "./corpus.ts";
import {
  appendHistoryRecord,
  buildHistoryRecord,
  validateHistoryFile,
} from "./history.ts";
import {
  compareAgainstBaseline,
  ConfigError,
  getGitMetadata,
  type HarnessName,
  loadBaselineSummary,
  runEvalSuite,
  type RunScope,
} from "./runner.ts";

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
}

interface ValidateCliOptions {
  evalsDir: string;
  historyFile?: string;
}

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
    .action(async (opts: RunCliOptions) => {
      if (opts.harness !== "codex" && opts.harness !== "agy") {
        throw new ConfigError(
          `Unsupported harness "${opts.harness}". Supported harnesses: codex, agy.`,
        );
      }
      const harness: HarnessName = opts.harness;

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
      });

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

      const { summary, runOutDir } = await runEvalSuite(matched, files, {
        harness,
        evalsDir: opts.evalsDir,
        skillsDir: opts.skillsDir,
        outDir: opts.outDir,
        timeoutMs,
        keepWorkdir: Boolean(opts.keepWorkdir),
        runScope,
        skippedCases,
      });

      console.log(
        `Completed ${summary.total_cases} case(s): ${summary.passed_cases} passed, ${summary.failed_cases} failed.`,
      );
      console.log(`Artifacts written to ${runOutDir}`);
      if (summary.aborted_early) {
        console.error(`Aborted early: ${summary.abort_reason}`);
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

      exitCode = summary.failed_cases > 0 || summary.aborted_early ? 1 : 0;
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
