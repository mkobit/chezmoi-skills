import { readFile } from "fs/promises";
import { z } from "zod";
import { listedFiles } from "./hash.ts";

export {
  corpusHash,
  fileSha256,
  listedFiles,
  listedFilesRecursive,
  sha256,
} from "./hash.ts";

export const AnswerQualitySchema = z
  .object({
    required_concepts: z.array(z.string()).min(1).optional(),
    forbidden_claims: z.array(z.string()).min(1).optional(),
    clarification: z.enum(["required", "forbidden"]).optional(),
    safety_expectations: z.array(z.string()).min(1).optional(),
  })
  .refine(
    (expectation) =>
      expectation.required_concepts !== undefined ||
      expectation.forbidden_claims !== undefined ||
      expectation.clarification !== undefined ||
      expectation.safety_expectations !== undefined,
    "Answer quality expectations must include at least one assertion.",
  );

export const MockResponseSchema = z
  .object({
    match_args: z.array(z.string()).optional(),
    match_regex: z.string().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exit_code: z.number().int().min(0).max(255).optional(),
  })
  .refine(
    (entry) =>
      entry.match_args !== undefined || entry.match_regex !== undefined,
    "Mock response must specify at least one of match_args or match_regex.",
  )
  .refine((entry) => {
    if (entry.match_regex === undefined) return true;
    try {
      new RegExp(entry.match_regex);
      return true;
    } catch {
      return false;
    }
  }, "Mock response match_regex must be a valid regular expression.");

export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  eval_type: z.enum([
    "trigger_matching",
    "skill_selection",
    "command_correctness",
    "answer_quality",
  ]),
  target_skill: z.string(),
  origin: z.enum(["contrived", "distilled"]).default("contrived"),
  smoke: z.boolean().optional(),
  input: z.object({
    user_prompt: z.string(),
    context_files: z.array(z.string()).optional(),
  }),
  expected: z.object({
    should_trigger: z.boolean().optional(),
    selected_skill: z.string().optional(),
    selected_skills: z.array(z.string()).min(1).optional(),
    allow_clarification: z.boolean().optional(),
    exact_command: z.string().optional(),
    command_regex: z.string().optional(),
    required_flags: z.array(z.string()).optional(),
    forbidden_flags: z.array(z.string()).optional(),
    answer_quality: AnswerQualitySchema.optional(),
    required_references: z.array(z.string().min(1)).optional(),
    allow_prose_command: z.boolean().optional(),
  }),
  token_budget: z.number().optional(),
  mock_responses: z.array(MockResponseSchema).optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;
export type AnswerQuality = z.infer<typeof AnswerQualitySchema>;
export type MockResponse = z.infer<typeof MockResponseSchema>;

export type MockCallOutcome =
  "matched_case" | "matched_default" | "unmocked_fallback" | "cap_exceeded";

export interface MockCallRecord {
  command: string;
  args: string[];
  outcome: MockCallOutcome;
  exit_code: number;
}

export interface NormalizedTrace {
  discovered_skills: string[];
  references_read: string[];
  commands_invoked: string[];
  final_response: string;
  trace_violations: string[];
  mock_calls?: MockCallRecord[];
}

export interface AssertionOutcome {
  passed: boolean;
  reason?: string;
}

export interface CorpusFilter {
  skill?: string;
  caseId?: string;
  smoke?: boolean;
  origin?: TestCase["origin"];
}

export const loadCorpus = async (
  evalsDir = "tests/evals",
): Promise<{ cases: TestCase[]; files: string[] }> => {
  const files = listedFiles(evalsDir, ".json");
  const schema = z.array(TestCaseSchema);
  const cases: TestCase[] = [];

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid test cases in ${file}: ${issues}`);
    }
    cases.push(...result.data);
  }

  return { cases, files };
};

export const filterCases = (
  cases: TestCase[],
  filter: CorpusFilter,
): TestCase[] =>
  cases.filter((testCase) => {
    if (filter.skill !== undefined && testCase.target_skill !== filter.skill)
      return false;
    if (filter.caseId !== undefined && testCase.id !== filter.caseId)
      return false;
    if (filter.smoke !== undefined && Boolean(testCase.smoke) !== filter.smoke)
      return false;
    if (filter.origin !== undefined && testCase.origin !== filter.origin)
      return false;
    return true;
  });

export const skillRoutingMatches = (
  trace: NormalizedTrace,
  testCase: TestCase,
): AssertionOutcome => {
  const { expected, eval_type: evalType, target_skill: targetSkill } = testCase;

  if (evalType === "trigger_matching") {
    if (expected.should_trigger === true) {
      return trace.discovered_skills.includes(targetSkill)
        ? { passed: true }
        : {
            passed: false,
            reason: `Expected skill "${targetSkill}" to be discovered, got [${trace.discovered_skills.join(", ")}]`,
          };
    }
    if (expected.should_trigger === false) {
      return trace.discovered_skills.length === 0
        ? { passed: true }
        : {
            passed: false,
            reason: `Expected no skills discovered, got [${trace.discovered_skills.join(", ")}]`,
          };
    }
    return {
      passed: false,
      reason: "trigger_matching requires expected.should_trigger",
    };
  }

  if (evalType === "skill_selection") {
    const allowed =
      expected.selected_skills ??
      (expected.selected_skill ? [expected.selected_skill] : [targetSkill]);
    if (allowed.some((skill) => trace.discovered_skills.includes(skill))) {
      return { passed: true };
    }
    if (
      expected.allow_clarification === true &&
      trace.final_response.includes("?")
    ) {
      return { passed: true };
    }
    return {
      passed: false,
      reason: `Expected one of [${allowed.join(", ")}] to be discovered${expected.allow_clarification === true ? " or clarification question" : ""}, got [${trace.discovered_skills.join(", ")}]`,
    };
  }

  return {
    passed: false,
    reason: `skillRoutingMatches does not support eval_type "${evalType}"`,
  };
};

const normalizePath = (value: string): string =>
  value.replace(/\\/g, "/").replace(/^\.\//, "");

const normalizeRequiredReference = (ref: string): string =>
  normalizePath(ref).replace(/^skills\/[^/]+\//, "");

export const referenceReadsMatch = (
  trace: NormalizedTrace,
  expected: TestCase["expected"],
): AssertionOutcome => {
  if (!expected.required_references?.length) {
    return { passed: true };
  }

  const readRefs = trace.references_read.map(normalizePath);
  const missing = expected.required_references
    .map(normalizeRequiredReference)
    .filter((req) => {
      return !readRefs.some(
        (readRef) =>
          readRef === req ||
          (req.startsWith("references/") && readRef.endsWith(`/${req}`)),
      );
    });

  if (missing.length > 0) {
    return {
      passed: false,
      reason: `Missing required reference reads: ${missing.join(", ")}`,
    };
  }
  return { passed: true };
};

const markdownCandidates = (output: string): string[] => {
  const inlineCode = [...output.matchAll(/`([^`\n]+)`/g)].map(
    (match) => match[1] ?? "",
  );
  const lines = output.split(/\r?\n/).map((line) =>
    line
      .replace(/^\s*```[^\s]*\s*$/, "")
      .replace(/^\s*(?:[-*+] |\d+[.)] )/, "")
      .trim(),
  );
  return [output.trim(), ...inlineCode, ...lines].filter(Boolean);
};

export const commandMatches = (
  trace: NormalizedTrace,
  expected: TestCase["expected"],
): AssertionOutcome => {
  const candidates =
    expected.allow_prose_command === true
      ? [...trace.commands_invoked, ...markdownCandidates(trace.final_response)]
      : trace.commands_invoked;

  if (candidates.length === 0) {
    return {
      passed: false,
      reason:
        expected.allow_prose_command === true
          ? "No commands invoked and no command candidates found in final_response"
          : "No commands invoked in trace",
    };
  }

  const regex =
    expected.command_regex !== undefined
      ? new RegExp(expected.command_regex)
      : undefined;
  const requiredFlags = expected.required_flags ?? [];
  const forbiddenFlags = expected.forbidden_flags ?? [];

  const matched = candidates.some((candidate) => {
    if (
      expected.exact_command !== undefined &&
      candidate !== expected.exact_command &&
      !candidate.includes(expected.exact_command)
    ) {
      return false;
    }
    if (regex !== undefined && !regex.test(candidate)) {
      return false;
    }
    if (!requiredFlags.every((flag) => candidate.includes(flag))) {
      return false;
    }
    if (!forbiddenFlags.every((flag) => !candidate.includes(flag))) {
      return false;
    }
    return true;
  });

  return matched
    ? { passed: true }
    : {
        passed: false,
        reason: `No command candidate matched constraints (checked ${candidates.length} candidate(s))`,
      };
};

export const answerQualityMatches = (
  trace: NormalizedTrace,
  expected: TestCase["expected"],
): AssertionOutcome => {
  const quality = expected.answer_quality;
  if (!quality) {
    return {
      passed: false,
      reason: "answer_quality expectations are missing",
    };
  }

  const text = trace.final_response.toLowerCase();

  const missingConcepts = (quality.required_concepts ?? []).filter(
    (phrase) => !text.includes(phrase.toLowerCase()),
  );
  if (missingConcepts.length > 0) {
    return {
      passed: false,
      reason: `Missing required concepts: ${missingConcepts.join(", ")}`,
    };
  }

  const foundForbidden = (quality.forbidden_claims ?? []).filter((phrase) =>
    text.includes(phrase.toLowerCase()),
  );
  if (foundForbidden.length > 0) {
    return {
      passed: false,
      reason: `Found forbidden claims: ${foundForbidden.join(", ")}`,
    };
  }

  const missingSafety = (quality.safety_expectations ?? []).filter(
    (phrase) => !text.includes(phrase.toLowerCase()),
  );
  if (missingSafety.length > 0) {
    return {
      passed: false,
      reason: `Missing safety expectations: ${missingSafety.join(", ")}`,
    };
  }

  if (quality.clarification === "required" && !text.includes("?")) {
    return {
      passed: false,
      reason: "Expected a clarification question (?)",
    };
  }
  if (quality.clarification === "forbidden" && text.includes("?")) {
    return {
      passed: false,
      reason: "Clarification question (?) is forbidden",
    };
  }

  return { passed: true };
};

export const evaluateTrace = (
  trace: NormalizedTrace,
  testCase: TestCase,
): {
  passed: boolean;
  assertions: Array<{ name: string; passed: boolean; reason?: string }>;
  reason?: string;
} => {
  const assertions: Array<{ name: string; passed: boolean; reason?: string }> =
    [];

  if (trace.trace_violations.length > 0) {
    assertions.push({
      name: "trace_violations",
      passed: false,
      reason: `Trace violations: ${trace.trace_violations.join("; ")}`,
    });
  } else {
    assertions.push({ name: "trace_violations", passed: true });
  }

  if (
    testCase.eval_type === "trigger_matching" ||
    testCase.eval_type === "skill_selection"
  ) {
    assertions.push({
      name: "skill_routing",
      ...skillRoutingMatches(trace, testCase),
    });
  } else if (testCase.eval_type === "command_correctness") {
    assertions.push({
      name: "command_matches",
      ...commandMatches(trace, testCase.expected),
    });
  } else if (testCase.eval_type === "answer_quality") {
    assertions.push({
      name: "answer_quality",
      ...answerQualityMatches(trace, testCase.expected),
    });
  }

  if (testCase.expected.required_references?.length) {
    assertions.push({
      name: "reference_reads",
      ...referenceReadsMatch(trace, testCase.expected),
    });
  }

  const failed = assertions.filter((assertion) => !assertion.passed);
  if (failed.length > 0) {
    return {
      passed: false,
      assertions,
      reason: failed
        .map((assertion) => assertion.reason ?? assertion.name)
        .join("; "),
    };
  }

  return { passed: true, assertions };
};
