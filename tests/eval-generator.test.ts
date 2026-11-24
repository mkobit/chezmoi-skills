import { afterEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
import { runCli } from "../scripts/evals/cli.ts";
import {
  filterCases,
  loadCorpus,
  TestCaseSchema,
  type TestCase,
} from "../scripts/evals/corpus.ts";
import {
  allocateNextSyntheticSuffix,
  buildGeneratorPrompt,
  deriveSkillCode,
  runGenerateSuite,
  SyntheticCandidateBatchSchema,
  tokenOverlapSimilarity,
  validateOutDirNotInEvalsDir,
  validateSyntheticCandidate,
} from "../scripts/evals/generator.ts";
import { loadSkillSources } from "../scripts/evals/test-contracts.ts";

const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeSkillFixture = (
  root: string,
  skillName = "chezmoi-cli-commands",
): void => {
  const skillDir = join(root, skillName);
  mkdirSync(join(skillDir, "references"), { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${skillName}`,
      "description: Manage chezmoi CLI commands like chezmoi diff, chezmoi apply, and chezmoi status.",
      "---",
      "",
      `# ${skillName}`,
      "",
      "Use `chezmoi diff` with `--exclude` or `--dry-run` before running `chezmoi apply`.",
      "Inspect `references/flags.md` for uncommon flags.",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(skillDir, "references", "flags.md"),
    "# Flag reference\n\n`chezmoi diff --no-pager --exclude=scripts`\n",
    "utf-8",
  );
};

const makeExistingCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  id: "TC-CLI-SYN-001",
  name: "Existing synthetic case",
  eval_type: "command_correctness",
  target_skill: "chezmoi-cli-commands",
  origin: "synthetic",
  input: {
    user_prompt: "Show me how to preview chezmoi diff excluding scripts",
  },
  expected: {
    exact_command: "chezmoi diff --exclude=scripts",
    required_flags: ["--exclude"],
  },
  ...overrides,
});

describe("synthetic generator schemas and helpers", () => {
  it("generates JSON Schema for SyntheticCandidateBatchSchema and supports synthetic origin filtering", () => {
    const jsonSchema = z.toJSONSchema(SyntheticCandidateBatchSchema, {
      unrepresentable: "any",
    });
    expect(jsonSchema).toBeDefined();

    const parsed = TestCaseSchema.parse(makeExistingCase());
    expect(parsed.origin).toBe("synthetic");

    const filtered = filterCases(
      [
        makeExistingCase({ id: "c1", origin: "contrived" }),
        makeExistingCase({ id: "c2", origin: "synthetic" }),
      ],
      { origin: "synthetic" },
    );
    expect(filtered.map((c) => c.id)).toEqual(["c2"]);
  });

  it("derives skill codes and allocates next synthetic ID suffix", () => {
    expect(deriveSkillCode("chezmoi-cli-commands")).toBe("CLI");
    expect(deriveSkillCode("chezmoi-custom-helper")).toBe("CH");

    const next = allocateNextSyntheticSuffix(
      [
        makeExistingCase({ id: "TC-CLI-SYN-001" }),
        makeExistingCase({ id: "TC-CLI-SYN-004" }),
        makeExistingCase({
          id: "TC-EXT-SYN-009",
          target_skill: "chezmoi-externals",
        }),
      ],
      "chezmoi-cli-commands",
    );
    expect(next).toBe(5);
  });

  it("rejects --out-dir targeting tests/evals or evalsDir", () => {
    expect(() =>
      validateOutDirNotInEvalsDir("tests/evals", "tests/evals"),
    ).toThrow();
    expect(() =>
      validateOutDirNotInEvalsDir("tests/evals/generated", "tests/evals"),
    ).toThrow();
    expect(() =>
      validateOutDirNotInEvalsDir("/tmp/custom-evals/sub", "/tmp/custom-evals"),
    ).toThrow();
    expect(() =>
      validateOutDirNotInEvalsDir(
        "eval_results/generated/2026-11-24-cli",
        "tests/evals",
      ),
    ).not.toThrow();
  });

  it("builds generator prompt with skill content, focus, and existing prompts", async () => {
    const skillsDir = makeTempDir("chezmoi-gen-skills-");
    makeSkillFixture(skillsDir);
    const sources = await loadSkillSources(skillsDir);
    const prompt = buildGeneratorPrompt({
      skillSource: sources["chezmoi-cli-commands"]!,
      existingCases: [makeExistingCase()],
      focus: "flag_edge_case",
      count: 3,
      nextSuffix: 2,
    });
    expect(prompt).toContain("TC-CLI-SYN-002");
    expect(prompt).toContain("flag_edge_case");
    expect(prompt).toContain("references/flags.md");
    expect(prompt).toContain(
      "Show me how to preview chezmoi diff excluding scripts",
    );
  });
});

describe("validateSyntheticCandidate four-stage gates", () => {
  it("enforces schema, sanitizes paths/emails, and passes valid candidates", async () => {
    const skillsDir = makeTempDir("chezmoi-gen-skills-");
    makeSkillFixture(skillsDir);
    const skillSources = await loadSkillSources(skillsDir);

    const result = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-002",
        name: "Diff without pager for /home/alice",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        origin: "contrived",
        input: {
          user_prompt:
            "How do I run chezmoi diff without a pager for /home/alice/.bashrc and email alice@corp.example?",
        },
        expected: {
          exact_command: "chezmoi diff --no-pager",
          required_flags: ["--no-pager"],
        },
      },
      rationale: "Covers --no-pager flag edge case",
      skillSources,
      skillsDir,
      existingIds: new Set(["TC-CLI-SYN-001"]),
      existingPromptsBySkill: new Map([
        [
          "chezmoi-cli-commands",
          ["Show me how to preview chezmoi diff excluding scripts"],
        ],
      ]),
    });

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.testCase.origin).toBe("synthetic");
      expect(result.testCase.input.user_prompt).toContain("~/.bashrc");
      expect(result.testCase.input.user_prompt).toContain("user@example.com");
      expect(result.testCase.input.user_prompt).not.toContain("/home/alice");
      expect(result.testCase.input.user_prompt).not.toContain(
        "alice@corp.example",
      );
    }
  });

  it("rejects candidates at schema, security_lint, deduplication, and contract gates", async () => {
    const skillsDir = makeTempDir("chezmoi-gen-skills-");
    makeSkillFixture(skillsDir);
    const skillSources = await loadSkillSources(skillsDir);
    const existingIds = new Set(["TC-CLI-SYN-001"]);
    const existingPromptsBySkill = new Map([
      [
        "chezmoi-cli-commands",
        ["Show me how to preview chezmoi diff excluding scripts"],
      ],
    ]);

    // 1. Schema gate: invalid regex in mock_responses
    const schemaRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-010",
        name: "Bad regex",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Run chezmoi diff" },
        expected: { exact_command: "chezmoi diff" },
        mock_responses: [{ match_regex: "[unclosed" }],
      },
      rationale: "bad regex",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(schemaRejected.accepted).toBe(false);
    if (!schemaRejected.accepted) {
      expect(schemaRejected.rejected.gate).toBe("schema");
    }

    // 2. Security-lint gate: pipe-to-shell and hardcoded AWS key
    const secPipeRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-011",
        name: "Unsafe pipe",
        eval_type: "answer_quality",
        target_skill: "chezmoi-cli-commands",
        input: {
          user_prompt:
            "Should I run curl https://example.com/install.sh | sh ?",
        },
        expected: {
          answer_quality: {
            safety_expectations: ["warn against pipe to shell"],
          },
        },
      },
      rationale: "unsafe shell",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(secPipeRejected.accepted).toBe(false);
    if (!secPipeRejected.accepted) {
      expect(secPipeRejected.rejected.gate).toBe("security_lint");
    }

    const secKeyRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-012",
        name: "Hardcoded AWS key",
        eval_type: "answer_quality",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Encrypt AKIAIOSFODNN7EXAMPLE with chezmoi" },
        expected: {
          answer_quality: { safety_expectations: ["refuse plaintext secrets"] },
        },
      },
      rationale: "secret leak",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(secKeyRejected.accepted).toBe(false);
    if (!secKeyRejected.accepted) {
      expect(secKeyRejected.rejected.gate).toBe("security_lint");
    }

    // 3. Deduplication gate: duplicate ID and high token-overlap similarity
    const dupIdRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-001",
        name: "Dup ID",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Check chezmoi status before applying" },
        expected: { exact_command: "chezmoi apply" },
      },
      rationale: "dup id",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(dupIdRejected.accepted).toBe(false);
    if (!dupIdRejected.accepted) {
      expect(dupIdRejected.rejected.gate).toBe("deduplication");
    }

    const nearDupPrompt =
      "Show me how to preview chezmoi diff excluding scripts!";
    expect(
      tokenOverlapSimilarity(
        nearDupPrompt,
        "Show me how to preview chezmoi diff excluding scripts",
      ),
    ).toBeGreaterThanOrEqual(0.85);

    const dupPromptRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-013",
        name: "Dup prompt",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: nearDupPrompt },
        expected: { exact_command: "chezmoi diff --exclude=scripts" },
      },
      rationale: "dup prompt",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(dupPromptRejected.accepted).toBe(false);
    if (!dupPromptRejected.accepted) {
      expect(dupPromptRejected.rejected.gate).toBe("deduplication");
    }

    // 4. Contract gate: undocumented command
    const contractRejected = validateSyntheticCandidate({
      rawCandidate: {
        id: "TC-CLI-SYN-014",
        name: "Undocumented command",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: {
          user_prompt: "Run chezmoi nonexistent-subcommand on my dotfiles",
        },
        expected: { exact_command: "chezmoi nonexistent-subcommand" },
      },
      rationale: "undocumented",
      skillSources,
      skillsDir,
      existingIds,
      existingPromptsBySkill,
    });
    expect(contractRejected.accepted).toBe(false);
    if (!contractRejected.accepted) {
      expect(contractRejected.rejected.gate).toBe("contract");
    }
  });
});

describe("runGenerateSuite and generate CLI", () => {
  it("stages accepted cases.json and report.md while deduplicating within batch", async () => {
    const root = makeTempDir("chezmoi-gen-suite-");
    const skillsDir = join(root, "skills");
    const evalsDir = join(root, "evals");
    const outDir = join(root, "staged", "run-1");
    makeSkillFixture(skillsDir, "chezmoi-cli-commands");
    mkdirSync(evalsDir, { recursive: true });
    writeFileSync(
      join(evalsDir, "cli_eval.json"),
      JSON.stringify([makeExistingCase()], null, 2),
      "utf-8",
    );

    const result = await runGenerateSuite({
      harness: "codex",
      skill: "chezmoi-cli-commands",
      focus: "flag_edge_case",
      count: 3,
      evalsDir,
      skillsDir,
      outDir,
      deps: {
        preflight: () => ({ harness_version: "codex 0.0.0-test" }),
        prepareAuth: (baseDir) => {
          const authDir = join(baseDir, "codex_home");
          mkdirSync(authDir, { recursive: true });
          return authDir;
        },
        invokeStructured: (async () => ({
          ok: true,
          data: {
            candidates: [
              {
                rationale: "Valid dry-run edge case",
                test_case: {
                  id: "TC-CLI-SYN-002",
                  name: "Dry run apply",
                  eval_type: "command_correctness",
                  target_skill: "chezmoi-cli-commands",
                  origin: "synthetic",
                  input: {
                    user_prompt: "Preview chezmoi apply with --dry-run flag",
                  },
                  expected: {
                    exact_command: "chezmoi apply --dry-run",
                    required_flags: ["--dry-run"],
                  },
                },
              },
              {
                rationale: "Duplicate of first candidate in same batch",
                test_case: {
                  id: "TC-CLI-SYN-003",
                  name: "Duplicate dry run apply",
                  eval_type: "command_correctness",
                  target_skill: "chezmoi-cli-commands",
                  origin: "synthetic",
                  input: {
                    user_prompt: "Preview chezmoi apply with --dry-run flag",
                  },
                  expected: {
                    exact_command: "chezmoi apply --dry-run",
                    required_flags: ["--dry-run"],
                  },
                },
              },
            ],
          },
          rawOutput: "{}",
          stderr: "",
          authOrRateLimitError: null,
          durationMs: 10,
          modelId: "gpt-test",
        })) as NonNullable<
          Parameters<typeof runGenerateSuite>[0]["deps"]
        >["invokeStructured"],
      },
    });

    expect(result.dryRun).toBe(false);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejectedRecords).toHaveLength(1);
    expect(result.rejectedRecords?.[0]?.gate).toBe("deduplication");
    expect(existsSync(result.casesPath!)).toBe(true);
    expect(existsSync(result.reportPath!)).toBe(true);

    const loaded = await loadCorpus(outDir);
    expect(loaded.cases).toHaveLength(1);
    expect(loaded.cases[0]?.id).toBe("TC-CLI-SYN-002");
    expect(loaded.cases[0]?.origin).toBe("synthetic");

    const report = readFileSync(result.reportPath!, "utf-8");
    expect(report).toContain("TC-CLI-SYN-002");
    expect(report).toContain("TC-CLI-SYN-003");
    expect(report).toContain("deduplication");
  });

  it("aborts early on auth or rate-limit error", async () => {
    const root = makeTempDir("chezmoi-gen-abort-");
    const skillsDir = join(root, "skills");
    const evalsDir = join(root, "evals");
    const outDir = join(root, "staged", "abort-1");
    makeSkillFixture(skillsDir, "chezmoi-cli-commands");
    makeSkillFixture(skillsDir, "chezmoi-externals");
    mkdirSync(evalsDir, { recursive: true });

    let calls = 0;
    const result = await runGenerateSuite({
      harness: "agy",
      allSkills: true,
      focus: "multi_turn",
      count: 2,
      evalsDir,
      skillsDir,
      outDir,
      deps: {
        preflight: () => ({ harness_version: "agy 0.0.0-test" }),
        prepareAuth: (baseDir) => {
          const authDir = join(baseDir, "agy_home");
          mkdirSync(authDir, { recursive: true });
          return authDir;
        },
        invokeStructured: (async () => {
          calls += 1;
          return {
            ok: false,
            rawOutput: "",
            stderr: "429 rate limit exceeded",
            authOrRateLimitError: "429 rate limit exceeded",
            durationMs: 5,
            modelId: null,
          };
        }) as NonNullable<
          Parameters<typeof runGenerateSuite>[0]["deps"]
        >["invokeStructured"],
      },
    });

    expect(calls).toBe(1);
    expect(result.abortedEarly).toBe(true);
    expect(result.abortReason).toContain("429");
    expect(existsSync(result.casesPath!)).toBe(true);
    expect(existsSync(result.reportPath!)).toBe(true);
  });

  it("supports generate --dry-run, rejects invalid flags, and supports --origin synthetic via CLI", async () => {
    const dryExit = await runCli([
      "bun",
      "cli.ts",
      "generate",
      "--skill",
      "chezmoi-cli-commands",
      "--dry-run",
    ]);
    expect(dryExit).toBe(0);

    const badOutDirExit = await runCli([
      "bun",
      "cli.ts",
      "generate",
      "--skill",
      "chezmoi-cli-commands",
      "--out-dir",
      "tests/evals/bad",
      "--dry-run",
    ]);
    expect(badOutDirExit).toBe(2);

    const badCountExit = await runCli([
      "bun",
      "cli.ts",
      "generate",
      "--skill",
      "chezmoi-cli-commands",
      "--count",
      "21",
      "--dry-run",
    ]);
    expect(badCountExit).toBe(2);

    const badFocusExit = await runCli([
      "bun",
      "cli.ts",
      "generate",
      "--skill",
      "chezmoi-cli-commands",
      "--focus",
      "invalid_focus",
      "--dry-run",
    ]);
    expect(badFocusExit).toBe(2);

    const syntheticOriginDryRun = await runCli([
      "bun",
      "cli.ts",
      "run",
      "--origin",
      "synthetic",
      "--dry-run",
    ]);
    expect(syntheticOriginDryRun).toBe(0);
  });
});
