import { Command, CommanderError } from "commander";
import { filterCases, loadCorpus } from "./corpus.ts";
import { ConfigError, runEvalSuite } from "./runner.ts";

interface RunCliOptions {
  harness: string;
  skill?: string;
  case?: string;
  smoke?: boolean;
  dryRun?: boolean;
  timeout: string;
  keepWorkdir?: boolean;
  evalsDir: string;
  skillsDir: string;
  outDir: string;
}

interface ValidateCliOptions {
  evalsDir: string;
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
    .action(async (opts: ValidateCliOptions) => {
      try {
        const { cases, files } = await loadCorpus(opts.evalsDir);
        console.log(
          `Validated ${cases.length} case(s) across ${files.length} file(s).`,
        );
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
    .option("--harness <name>", "Harness to execute", "codex")
    .option("--skill <skill>", "Filter cases by target_skill")
    .option("--case <id>", "Filter cases by case id")
    .option("--smoke", "Run only smoke-tagged cases")
    .option("--dry-run", "List matched cases without running the harness")
    .option("--timeout <ms>", "Per-case timeout in milliseconds", "90000")
    .option("--keep-workdir", "Preserve isolated temporary workdir after run")
    .option("--evals-dir <dir>", "Path to eval corpus directory", "tests/evals")
    .option("--skills-dir <dir>", "Path to skills directory", "skills")
    .option(
      "--out-dir <dir>",
      "Path to evaluation artifacts directory",
      "eval_results",
    )
    .action(async (opts: RunCliOptions) => {
      if (opts.harness !== "codex") {
        throw new ConfigError(
          `Unsupported harness "${opts.harness}". Only "codex" is supported.`,
        );
      }

      const timeoutMs = parsePositiveInt(opts.timeout, "--timeout");

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

      const { summary, runOutDir } = await runEvalSuite(matched, files, {
        harness: opts.harness,
        evalsDir: opts.evalsDir,
        skillsDir: opts.skillsDir,
        outDir: opts.outDir,
        timeoutMs,
        keepWorkdir: Boolean(opts.keepWorkdir),
      });

      console.log(
        `Completed ${summary.total_cases} case(s): ${summary.passed_cases} passed, ${summary.failed_cases} failed.`,
      );
      console.log(`Artifacts written to ${runOutDir}`);
      if (summary.aborted_early) {
        console.error(`Aborted early: ${summary.abort_reason}`);
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
