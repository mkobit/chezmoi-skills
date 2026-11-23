import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  TestCaseSchema,
  answerQualityMatches,
  commandMatches,
  evaluateTrace,
  filterCases,
  loadCorpus,
  referenceReadsMatch,
  skillRoutingMatches,
  type NormalizedTrace,
  type TestCase,
} from "../scripts/evals/corpus.ts";

const makeCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  id: "case-1",
  name: "Sample case",
  eval_type: "command_correctness",
  target_skill: "chezmoi-cli-commands",
  origin: "contrived",
  input: {
    user_prompt: "Show diff without scripts",
  },
  expected: {
    exact_command: "chezmoi diff --exclude scripts",
  },
  ...overrides,
});

const makeTrace = (
  overrides: Partial<NormalizedTrace> = {},
): NormalizedTrace => ({
  discovered_skills: [],
  references_read: [],
  commands_invoked: [],
  final_response: "",
  trace_violations: [],
  ...overrides,
});

describe("TestCaseSchema", () => {
  it("parses legacy cases without new optional fields and defaults origin to contrived", () => {
    const parsed = TestCaseSchema.parse({
      id: "legacy-1",
      name: "Legacy case",
      eval_type: "trigger_matching",
      target_skill: "chezmoi-templating",
      input: { user_prompt: "How do I write a template?" },
      expected: { should_trigger: true },
    });

    expect(parsed.origin).toBe("contrived");
    expect(parsed.smoke).toBeUndefined();
    expect(parsed.mock_responses).toBeUndefined();
  });

  it("parses new optional fields including origin, smoke, required_references, allow_prose_command, and mock_responses", () => {
    const parsed = TestCaseSchema.parse({
      id: "new-1",
      name: "Distilled smoke case",
      eval_type: "command_correctness",
      target_skill: "chezmoi-cli-commands",
      origin: "distilled",
      smoke: true,
      input: { user_prompt: "Check status" },
      expected: {
        exact_command: "chezmoi status",
        required_references: ["references/commands.md"],
        allow_prose_command: true,
      },
      mock_responses: [
        {
          match_args: ["status"],
          stdout: "MM .bashrc\n",
          exit_code: 0,
        },
        {
          match_regex: "^diff\\b",
          stderr: "",
          exit_code: 1,
        },
      ],
    });

    expect(parsed.origin).toBe("distilled");
    expect(parsed.smoke).toBe(true);
    expect(parsed.expected.required_references).toEqual([
      "references/commands.md",
    ]);
    expect(parsed.expected.allow_prose_command).toBe(true);
    expect(parsed.mock_responses).toHaveLength(2);
  });

  it("rejects invalid mock_responses", () => {
    expect(() =>
      TestCaseSchema.parse({
        id: "bad-mock-1",
        name: "Missing matcher",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Check status" },
        expected: { exact_command: "chezmoi status" },
        mock_responses: [{ stdout: "ok", exit_code: 0 }],
      }),
    ).toThrow();

    expect(() =>
      TestCaseSchema.parse({
        id: "bad-mock-2",
        name: "Invalid regex",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Check status" },
        expected: { exact_command: "chezmoi status" },
        mock_responses: [{ match_regex: "[unclosed", exit_code: 0 }],
      }),
    ).toThrow();

    expect(() =>
      TestCaseSchema.parse({
        id: "bad-mock-3",
        name: "Out of range exit code",
        eval_type: "command_correctness",
        target_skill: "chezmoi-cli-commands",
        input: { user_prompt: "Check status" },
        expected: { exact_command: "chezmoi status" },
        mock_responses: [{ match_args: ["status"], exit_code: 300 }],
      }),
    ).toThrow();
  });
});

describe("loadCorpus and filterCases", () => {
  it("loads the checked-in eval corpus", async () => {
    const { cases, files } = await loadCorpus("tests/evals");
    expect(files.length).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThan(0);
    expect(files).toEqual([...files].sort());
  });

  it("includes filename in error messages when corpus file is invalid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-corpus-"));
    try {
      const badFile = join(dir, "broken.json");
      writeFileSync(badFile, JSON.stringify([{ id: "incomplete" }]));
      await expect(loadCorpus(dir)).rejects.toThrow("broken.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("combines skill, caseId, and smoke filters with logical AND", () => {
    const cases = [
      makeCase({
        id: "c1",
        target_skill: "chezmoi-cli-commands",
        smoke: true,
      }),
      makeCase({
        id: "c2",
        target_skill: "chezmoi-cli-commands",
        smoke: false,
      }),
      makeCase({
        id: "c3",
        target_skill: "chezmoi-templating",
        smoke: true,
      }),
    ];

    expect(
      filterCases(cases, {
        skill: "chezmoi-cli-commands",
        smoke: true,
      }).map((c) => c.id),
    ).toEqual(["c1"]);

    expect(
      filterCases(cases, {
        skill: "chezmoi-cli-commands",
        caseId: "c2",
      }).map((c) => c.id),
    ).toEqual(["c2"]);

    expect(
      filterCases(cases, {
        skill: "chezmoi-templating",
        caseId: "c1",
      }),
    ).toEqual([]);
  });

  it("filters cases by origin", () => {
    const cases = [
      makeCase({ id: "c1", origin: "contrived" }),
      makeCase({ id: "c2", origin: "distilled" }),
    ];

    expect(
      filterCases(cases, { origin: "distilled" }).map((c) => c.id),
    ).toEqual(["c2"]);
    expect(
      filterCases(cases, { origin: "contrived" }).map((c) => c.id),
    ).toEqual(["c1"]);
  });
});

describe("Trace-backed assertions", () => {
  it("evaluates skillRoutingMatches for trigger_matching and skill_selection", () => {
    const triggerYes = makeCase({
      eval_type: "trigger_matching",
      target_skill: "chezmoi-templating",
      expected: { should_trigger: true },
    });
    expect(
      skillRoutingMatches(
        makeTrace({ discovered_skills: ["chezmoi-templating"] }),
        triggerYes,
      ).passed,
    ).toBe(true);
    expect(
      skillRoutingMatches(makeTrace({ discovered_skills: [] }), triggerYes)
        .passed,
    ).toBe(false);

    const triggerNo = makeCase({
      eval_type: "trigger_matching",
      target_skill: "chezmoi-templating",
      expected: { should_trigger: false },
    });
    expect(
      skillRoutingMatches(makeTrace({ discovered_skills: [] }), triggerNo)
        .passed,
    ).toBe(true);
    expect(
      skillRoutingMatches(
        makeTrace({ discovered_skills: ["chezmoi-templating"] }),
        triggerNo,
      ).passed,
    ).toBe(false);

    const selection = makeCase({
      eval_type: "skill_selection",
      target_skill: "chezmoi-configuration",
      expected: {
        selected_skills: ["chezmoi-configuration", "chezmoi-machine-config"],
        allow_clarification: true,
      },
    });
    expect(
      skillRoutingMatches(
        makeTrace({ discovered_skills: ["chezmoi-machine-config"] }),
        selection,
      ).passed,
    ).toBe(true);
    expect(
      skillRoutingMatches(
        makeTrace({ final_response: "Which machine are you targeting?" }),
        selection,
      ).passed,
    ).toBe(true);
    expect(
      skillRoutingMatches(
        makeTrace({
          discovered_skills: ["chezmoi-init"],
          final_response: "No question here.",
        }),
        selection,
      ).passed,
    ).toBe(false);
  });

  it("evaluates referenceReadsMatch with path normalization", () => {
    const expected: TestCase["expected"] = {
      required_references: [
        "./skills/chezmoi-templating/references/functions.md",
        "skills\\chezmoi-templating\\references\\variables.md",
      ],
    };

    expect(
      referenceReadsMatch(
        makeTrace({
          references_read: [
            "skills/chezmoi-templating/references/functions.md",
            "references/variables.md",
          ],
        }),
        expected,
      ).passed,
    ).toBe(true);

    expect(
      referenceReadsMatch(
        makeTrace({
          references_read: [
            "skills/chezmoi-templating/references/functions.md",
          ],
        }),
        expected,
      ).passed,
    ).toBe(false);
  });

  it("evaluates commandMatches with and without allow_prose_command", () => {
    const expectedStrict: TestCase["expected"] = {
      exact_command: "chezmoi diff --exclude scripts",
      command_regex: "^chezmoi diff",
      required_flags: ["--exclude"],
      forbidden_flags: ["--force"],
    };

    expect(
      commandMatches(
        makeTrace({
          commands_invoked: ["chezmoi diff --exclude scripts"],
        }),
        expectedStrict,
      ).passed,
    ).toBe(true);

    expect(
      commandMatches(
        makeTrace({
          commands_invoked: [],
          final_response: "Run `chezmoi diff --exclude scripts`",
        }),
        expectedStrict,
      ).passed,
    ).toBe(false);

    expect(
      commandMatches(
        makeTrace({
          commands_invoked: [],
          final_response: "Run `chezmoi diff --exclude scripts`",
        }),
        { ...expectedStrict, allow_prose_command: true },
      ).passed,
    ).toBe(true);

    expect(
      commandMatches(
        makeTrace({
          commands_invoked: ["chezmoi diff --exclude scripts --force"],
        }),
        expectedStrict,
      ).passed,
    ).toBe(false);
  });

  it("evaluates answerQualityMatches", () => {
    const expected: TestCase["expected"] = {
      answer_quality: {
        required_concepts: ["chezmoi.toml", "data"],
        forbidden_claims: ["chezmoi.yaml is required"],
        safety_expectations: ["do not commit secrets"],
        clarification: "forbidden",
      },
    };

    expect(
      answerQualityMatches(
        makeTrace({
          final_response:
            "Use chezmoi.toml for data variables, and do not commit secrets.",
        }),
        expected,
      ).passed,
    ).toBe(true);

    expect(
      answerQualityMatches(
        makeTrace({
          final_response:
            "Use chezmoi.toml for data variables, and do not commit secrets?",
        }),
        expected,
      ).passed,
    ).toBe(false);
  });

  it("evaluates full traces and fails when trace_violations are present", () => {
    const testCase = makeCase({
      eval_type: "command_correctness",
      expected: {
        exact_command: "chezmoi status",
        required_references: ["references/commands.md"],
      },
    });

    const passing = evaluateTrace(
      makeTrace({
        commands_invoked: ["chezmoi status"],
        references_read: ["skills/chezmoi-cli-commands/references/commands.md"],
      }),
      testCase,
    );
    expect(passing.passed).toBe(true);

    const violated = evaluateTrace(
      makeTrace({
        commands_invoked: ["chezmoi status"],
        references_read: ["skills/chezmoi-cli-commands/references/commands.md"],
        trace_violations: ["unmocked network call"],
      }),
      testCase,
    );
    expect(violated.passed).toBe(false);
    expect(violated.reason).toContain("unmocked network call");
  });
});
