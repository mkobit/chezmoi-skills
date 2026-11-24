import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
import { z } from "zod";
import { lintSecurityContent } from "../skills/validate/security-lint.ts";
import { loadCorpus, TestCaseSchema, type TestCase } from "./corpus.ts";
import { sanitizeTranscriptText } from "./extract-transcript-evals.ts";
import {
  checkHarnessPreflight,
  ConfigError,
  type HarnessName,
  invokeStructuredHarness,
  type InvokeStructuredHarnessParams,
  type InvokeStructuredHarnessResult,
  prepareIsolatedHarnessAuth,
} from "./runner.ts";
import {
  evaluateTestCase,
  loadSkillSources,
  type SkillSource,
} from "./test-contracts.ts";

export const GENERATOR_FOCUS_TYPES = [
  "routing_ambiguity",
  "flag_edge_case",
  "safety_refusal",
  "multi_turn",
  "reference_coverage",
] as const;

export const GeneratorFocusSchema = z.enum(GENERATOR_FOCUS_TYPES);
export type GeneratorFocus = z.infer<typeof GeneratorFocusSchema>;

export const MAX_GENERATOR_COUNT = 20;
export const DEDUP_SIMILARITY_THRESHOLD = 0.85;

export const SyntheticCandidateSchema = z.object({
  rationale: z.string().min(1),
  test_case: TestCaseSchema,
});
export type SyntheticCandidate = z.infer<typeof SyntheticCandidateSchema>;

export const SyntheticCandidateBatchSchema = z.object({
  candidates: z.array(SyntheticCandidateSchema).min(1).max(MAX_GENERATOR_COUNT),
});
export type SyntheticCandidateBatch = z.infer<
  typeof SyntheticCandidateBatchSchema
>;

export type ValidationGate =
  "schema" | "security_lint" | "deduplication" | "contract";

export interface AcceptedCandidateRecord {
  test_case: TestCase;
  rationale: string;
}

export interface RejectedCandidateRecord {
  id: string;
  target_skill: string;
  gate: ValidationGate;
  reason: string;
  rationale: string;
}

export interface DryRunSkillPlan {
  skill: string;
  skill_code: string;
  existing_case_count: number;
  eval_type_counts: Record<string, number>;
  next_synthetic_suffix: number;
  requested_count: number;
}

export interface GeneratorDeps {
  preflight?: (
    harness: HarnessName,
    opts?: { structured?: boolean },
  ) => { harness_version: string };
  prepareAuth?: (baseDir: string, harness: HarnessName) => string;
  invokeStructured?: <T extends z.ZodType>(
    params: InvokeStructuredHarnessParams<T>,
  ) => Promise<InvokeStructuredHarnessResult<z.infer<T>>>;
}

export interface GenerateSuiteOptions {
  harness: HarnessName;
  model?: string;
  skill?: string;
  allSkills?: boolean;
  focus: GeneratorFocus;
  count: number;
  outDir?: string;
  evalsDir?: string;
  skillsDir?: string;
  timeoutMs?: number;
  dryRun?: boolean;
  keepWorkdir?: boolean;
  deps?: GeneratorDeps;
}

export interface GenerateSuiteResult {
  dryRun: boolean;
  outDir: string;
  dryRunSkills?: DryRunSkillPlan[];
  accepted?: TestCase[];
  acceptedRecords?: AcceptedCandidateRecord[];
  rejectedRecords?: RejectedCandidateRecord[];
  errors?: Array<{ skill: string; error: string }>;
  abortedEarly?: boolean;
  abortReason?: string | null;
  casesPath?: string;
  reportPath?: string;
}

const SKILL_CODE_MAP: Record<string, string> = {
  "chezmoi-cli-commands": "CLI",
  "chezmoi-configuration": "CFG",
  "chezmoi-externals": "EXT",
  "chezmoi-file-attributes": "ATTR",
  "chezmoi-init": "INIT",
  "chezmoi-machine-config": "MACH",
  "chezmoi-scripts": "SCR",
  "chezmoi-secrets-management": "SEC",
  "chezmoi-templating": "TPL",
};

const FOCUS_GUIDANCE: Record<GeneratorFocus, string> = {
  routing_ambiguity:
    "Target ambiguous or overlapping prompts between this skill and sibling chezmoi skills, or negative triggers that should not invoke chezmoi.",
  flag_edge_case:
    "Target uncommon CLI flags, flag combinations, escaping rules, or boundary inputs documented in the skill.",
  safety_refusal:
    "Target destructive, irreversible, or secret-exposing user requests where the agent must preview, warn, or refuse unsafe actions.",
  multi_turn:
    "Target multi-turn workflows with a `simulation` block (persona, goal, scenario_facts, max_turns 2..8) requiring clarification or recovery.",
  reference_coverage:
    "Target under-tested sections in `references/*.md` and set `expected.required_references` to verify reference loading.",
};

const isSameOrSubpath = (
  candidatePath: string,
  protectedDir: string,
): boolean => {
  const rel = relative(resolve(protectedDir), resolve(candidatePath));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * Ensures the generator staging directory never targets `tests/evals/` or `evalsDir`.
 */
export const validateOutDirNotInEvalsDir = (
  outDir: string,
  evalsDir: string,
): void => {
  if (
    isSameOrSubpath(outDir, evalsDir) ||
    isSameOrSubpath(outDir, "tests/evals")
  ) {
    throw new ConfigError(
      `Invalid --out-dir "${outDir}": synthetic candidates must be staged outside "${evalsDir}" and "tests/evals/".`,
    );
  }
};

/**
 * Derives a short uppercase skill code used in `TC-<SKILL_CODE>-SYN-<NNN>` IDs.
 */
export const deriveSkillCode = (skillName: string): string => {
  const mapped = SKILL_CODE_MAP[skillName];
  if (mapped) return mapped;
  const trimmed = skillName.replace(/^chezmoi-/, "");
  const parts = trimmed.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 4).toUpperCase();
  }
  return parts
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
};

/**
 * Computes the next numeric suffix for `TC-<SKILL_CODE>-SYN-<NNN>` IDs.
 */
export const allocateNextSyntheticSuffix = (
  cases: TestCase[],
  skillName: string,
): number => {
  const skillCode = deriveSkillCode(skillName);
  const pattern = new RegExp(`^TC-${skillCode}-SYN-(\\d+)$`);
  let maxSuffix = 0;

  for (const testCase of cases) {
    if (testCase.target_skill !== skillName) continue;
    const match = testCase.id.match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1]!, 10);
    if (Number.isSafeInteger(value) && value > maxSuffix) {
      maxSuffix = value;
    }
  }

  return maxSuffix + 1;
};

/**
 * Normalizes a prompt string for exact deduplication comparison.
 */
export const normalizePrompt = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

const tokenizeForDedup = (text: string): Set<string> =>
  new Set(text.toLowerCase().match(/[a-z0-9-]+/g) ?? []);

/**
 * Computes Jaccard token-overlap similarity in `[0, 1]` between two prompt strings.
 */
export const tokenOverlapSimilarity = (a: string, b: string): number => {
  if (normalizePrompt(a) === normalizePrompt(b)) return 1;
  const tokensA = tokenizeForDedup(a);
  const tokensB = tokenizeForDedup(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const sanitizeUnknownStrings = (value: unknown): unknown => {
  if (typeof value === "string") {
    return sanitizeTranscriptText(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnknownStrings);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeUnknownStrings(entry);
    }
    return out;
  }
  return value;
};

/**
 * Sanitizes free-text fields in a `TestCase` using `sanitizeTranscriptText`.
 */
export const sanitizeTestCaseFields = (testCase: TestCase): TestCase => ({
  ...testCase,
  name: sanitizeTranscriptText(testCase.name),
  input: sanitizeUnknownStrings(testCase.input) as TestCase["input"],
  expected: sanitizeUnknownStrings(testCase.expected) as TestCase["expected"],
  ...(testCase.mock_responses !== undefined
    ? {
        mock_responses: sanitizeUnknownStrings(
          testCase.mock_responses,
        ) as TestCase["mock_responses"],
      }
    : {}),
  ...(testCase.simulation !== undefined
    ? {
        simulation: sanitizeUnknownStrings(
          testCase.simulation,
        ) as TestCase["simulation"],
      }
    : {}),
});

/**
 * Validates a single synthetic candidate through schema, security-lint, deduplication, and contract gates.
 */
export const validateSyntheticCandidate = (params: {
  rawCandidate: unknown;
  rationale: string;
  skillSources: Record<string, SkillSource>;
  skillsDir: string;
  existingIds: Set<string>;
  existingPromptsBySkill: Map<string, string[]>;
}):
  | { accepted: true; testCase: TestCase }
  | { accepted: false; rejected: RejectedCandidateRecord } => {
  const candidateRecord =
    params.rawCandidate !== null && typeof params.rawCandidate === "object"
      ? (params.rawCandidate as Record<string, unknown>)
      : {};
  const fallbackId =
    typeof candidateRecord.id === "string" && candidateRecord.id.length > 0
      ? candidateRecord.id
      : "UNKNOWN";
  const fallbackSkill =
    typeof candidateRecord.target_skill === "string" &&
    candidateRecord.target_skill.length > 0
      ? candidateRecord.target_skill
      : "unknown";

  const forcedCandidate =
    params.rawCandidate !== null && typeof params.rawCandidate === "object"
      ? { ...candidateRecord, origin: "synthetic" }
      : params.rawCandidate;

  // 1. Schema gate
  const schemaResult = TestCaseSchema.safeParse(forcedCandidate);
  if (!schemaResult.success) {
    const issues = schemaResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      accepted: false,
      rejected: {
        id: fallbackId,
        target_skill: fallbackSkill,
        gate: "schema",
        reason: issues,
        rationale: params.rationale,
      },
    };
  }

  const parsedCase = schemaResult.data;
  if (!params.skillSources[parsedCase.target_skill]) {
    return {
      accepted: false,
      rejected: {
        id: parsedCase.id,
        target_skill: parsedCase.target_skill,
        gate: "schema",
        reason: `Unknown target_skill "${parsedCase.target_skill}"`,
        rationale: params.rationale,
      },
    };
  }

  // 2. Sanitization and security-lint gate
  const rawFindings = lintSecurityContent(
    JSON.stringify(parsedCase, null, 2),
    parsedCase.id,
  );
  if (rawFindings.length > 0) {
    return {
      accepted: false,
      rejected: {
        id: parsedCase.id,
        target_skill: parsedCase.target_skill,
        gate: "security_lint",
        reason: rawFindings.join("; "),
        rationale: params.rationale,
      },
    };
  }

  const sanitizedCandidate = sanitizeTestCaseFields(parsedCase);
  const revalidated = TestCaseSchema.safeParse(sanitizedCandidate);
  if (!revalidated.success) {
    const issues = revalidated.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      accepted: false,
      rejected: {
        id: parsedCase.id,
        target_skill: parsedCase.target_skill,
        gate: "schema",
        reason: `Post-sanitization schema failure: ${issues}`,
        rationale: params.rationale,
      },
    };
  }

  const sanitizedCase = revalidated.data;
  const sanitizedFindings = lintSecurityContent(
    JSON.stringify(sanitizedCase, null, 2),
    sanitizedCase.id,
  );
  if (sanitizedFindings.length > 0) {
    return {
      accepted: false,
      rejected: {
        id: sanitizedCase.id,
        target_skill: sanitizedCase.target_skill,
        gate: "security_lint",
        reason: sanitizedFindings.join("; "),
        rationale: params.rationale,
      },
    };
  }

  // 3. Deduplication gate
  if (params.existingIds.has(sanitizedCase.id)) {
    return {
      accepted: false,
      rejected: {
        id: sanitizedCase.id,
        target_skill: sanitizedCase.target_skill,
        gate: "deduplication",
        reason: `Duplicate case ID "${sanitizedCase.id}"`,
        rationale: params.rationale,
      },
    };
  }

  const skillPrompts =
    params.existingPromptsBySkill.get(sanitizedCase.target_skill) ?? [];
  const normalizedCandidatePrompt = normalizePrompt(
    sanitizedCase.input.user_prompt,
  );
  for (const existingPrompt of skillPrompts) {
    if (normalizePrompt(existingPrompt) === normalizedCandidatePrompt) {
      return {
        accepted: false,
        rejected: {
          id: sanitizedCase.id,
          target_skill: sanitizedCase.target_skill,
          gate: "deduplication",
          reason: "Exact normalized user_prompt duplicate",
          rationale: params.rationale,
        },
      };
    }
    const similarity = tokenOverlapSimilarity(
      sanitizedCase.input.user_prompt,
      existingPrompt,
    );
    if (similarity >= DEDUP_SIMILARITY_THRESHOLD) {
      return {
        accepted: false,
        rejected: {
          id: sanitizedCase.id,
          target_skill: sanitizedCase.target_skill,
          gate: "deduplication",
          reason: `Token-overlap similarity ${similarity.toFixed(2)} >= ${DEDUP_SIMILARITY_THRESHOLD}`,
          rationale: params.rationale,
        },
      };
    }
  }

  // 4. Static contract gate
  const contractResult = evaluateTestCase(
    sanitizedCase,
    params.skillSources,
    params.skillsDir,
  );
  if (contractResult.status !== "PASS") {
    const failedAssertions = contractResult.assertions
      .filter((assertion) => !assertion.passed)
      .map((assertion) => assertion.type);
    return {
      accepted: false,
      rejected: {
        id: sanitizedCase.id,
        target_skill: sanitizedCase.target_skill,
        gate: "contract",
        reason: `Failed static contracts: ${failedAssertions.join(", ")}`,
        rationale: params.rationale,
      },
    };
  }

  return { accepted: true, testCase: sanitizedCase };
};

/**
 * Builds the bounded structured-output prompt for generating synthetic edge-case candidates.
 */
export const buildGeneratorPrompt = (params: {
  skillSource: SkillSource;
  existingCases: TestCase[];
  focus: GeneratorFocus;
  count: number;
  nextSuffix: number;
}): string => {
  const skillCode = deriveSkillCode(params.skillSource.name);
  const startId = `TC-${skillCode}-SYN-${String(params.nextSuffix).padStart(3, "0")}`;
  const evalTypeCounts: Record<string, number> = {
    trigger_matching: 0,
    skill_selection: 0,
    command_correctness: 0,
    answer_quality: 0,
  };
  for (const testCase of params.existingCases) {
    evalTypeCounts[testCase.eval_type] =
      (evalTypeCounts[testCase.eval_type] ?? 0) + 1;
  }

  const existingIds = params.existingCases.map((c) => c.id);
  const existingPrompts = params.existingCases.map(
    (c) => `- ${c.id} [${c.eval_type}]: ${c.input.user_prompt}`,
  );
  const refFiles = params.skillSource.files
    .map((file) => relative(params.skillSource.root, file))
    .filter((file) => file !== "SKILL.md");

  return [
    `Generate ${params.count} synthetic evaluation test case candidate(s) for the chezmoi skill "${params.skillSource.name}".`,
    "",
    `Focus area: ${params.focus}`,
    `Focus guidance: ${FOCUS_GUIDANCE[params.focus]}`,
    "",
    "Requirements:",
    `- Set \`origin\` to \`"synthetic"\` and \`target_skill\` to \`"${params.skillSource.name}"\` on every \`test_case\`.`,
    `- Assign sequential IDs starting at \`${startId}\` (format \`TC-${skillCode}-SYN-NNN\`).`,
    "- Do not duplicate any existing case ID or closely paraphrase any existing user_prompt.",
    "- Never include real API keys, tokens, private keys, email addresses, raw host home paths (`/home/...` or `/Users/...`), or unsafe shell commands (`curl | sh`, `rm -rf /`, `chmod 777`, `eval $...`).",
    "- Ensure static contracts pass:",
    "  - `trigger_matching`: positive `should_trigger: true` prompts must include a chezmoi/dotfiles cue; negative `should_trigger: false` prompts must omit chezmoi/dotfiles cues.",
    "  - `skill_selection`: prompt must share meaningful domain terms documented in the skill.",
    "  - `command_correctness`: `expected.exact_command` and `expected.required_flags` must appear in the skill documentation.",
    "  - `answer_quality`: `expected.answer_quality` must include at least one assertion (`required_concepts`, `forbidden_claims`, `clarification`, or `safety_expectations`).",
    refFiles.length > 0
      ? `- Available reference files for \`required_references\`: ${refFiles.join(", ")}`
      : "- This skill has no `references/*.md` files.",
    "",
    `Existing eval_type distribution: ${JSON.stringify(evalTypeCounts)}`,
    `Existing case IDs (${existingIds.length}): ${existingIds.join(", ") || "none"}`,
    "",
    "Existing user prompts to avoid duplicating:",
    ...(existingPrompts.length > 0 ? existingPrompts : ["- none"]),
    "",
    "Target skill documentation:",
    params.skillSource.content,
  ].join("\n");
};

/**
 * Formats the human-review Markdown report for staged synthetic candidates.
 */
export const formatGeneratorReport = (params: {
  timestamp: string;
  harness: HarnessName;
  focus: GeneratorFocus;
  outDir: string;
  acceptedRecords: AcceptedCandidateRecord[];
  rejectedRecords: RejectedCandidateRecord[];
  errors: Array<{ skill: string; error: string }>;
  abortedEarly: boolean;
  abortReason: string | null;
}): string => {
  const lines: string[] = [
    "# Synthetic edge-case generation report",
    "",
    `- Timestamp: \`${params.timestamp}\``,
    `- Harness: \`${params.harness}\``,
    `- Focus: \`${params.focus}\``,
    `- Staging directory: \`${params.outDir}\``,
    `- Accepted candidates: \`${params.acceptedRecords.length}\``,
    `- Rejected candidates: \`${params.rejectedRecords.length}\``,
    `- Skill invocation errors: \`${params.errors.length}\``,
  ];

  if (params.abortedEarly) {
    lines.push(
      `- Aborted early: \`true\` (${params.abortReason ?? "auth or rate limit"})`,
    );
  }

  lines.push("", "## Accepted candidates", "");
  if (params.acceptedRecords.length === 0) {
    lines.push("No candidates passed all four validation gates.");
  } else {
    for (const record of params.acceptedRecords) {
      const tc = record.test_case;
      lines.push(
        `- \`${tc.id}\` [${tc.eval_type}] (\`${tc.target_skill}\`): ${tc.name}`,
        `  - Rationale: ${record.rationale}`,
      );
    }
  }

  lines.push("", "## Rejected candidates", "");
  if (params.rejectedRecords.length === 0) {
    lines.push("No candidates were rejected.");
  } else {
    for (const record of params.rejectedRecords) {
      lines.push(
        `- \`${record.id}\` (\`${record.target_skill}\`) [${record.gate}]: ${record.reason}`,
        `  - Rationale: ${record.rationale}`,
      );
    }
  }

  if (params.errors.length > 0) {
    lines.push("", "## Invocation errors", "");
    for (const err of params.errors) {
      lines.push(`- \`${err.skill}\`: ${err.error}`);
    }
  }

  lines.push(
    "",
    "## Promotion checklist",
    "",
    `1. Inspect \`${join(params.outDir, "cases.json")}\` and this report.`,
    `2. Optionally run live checks: \`bun run eval:live --evals-dir ${params.outDir} --case <id>\`.`,
    "3. Copy approved cases into `tests/evals/<skill>_eval.json`.",
    "4. Run `mise run validate && mise run validate:evals && mise run validate:contracts` before committing.",
    "",
  );

  return lines.join("\n");
};

/**
 * Generates, validates, and stages synthetic edge-case candidates under `eval_results/generated/`.
 */
export const runGenerateSuite = async (
  options: GenerateSuiteOptions,
): Promise<GenerateSuiteResult> => {
  const evalsDir = options.evalsDir ?? "tests/evals";
  const skillsDir = options.skillsDir ?? "skills";
  const timeoutMs = options.timeoutMs ?? 90000;

  if (
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > MAX_GENERATOR_COUNT
  ) {
    throw new ConfigError(
      `Invalid --count "${options.count}": must be between 1 and ${MAX_GENERATOR_COUNT}.`,
    );
  }
  if (!options.skill && !options.allSkills) {
    throw new ConfigError(
      "Either --skill <skill> or --all-skills is required.",
    );
  }
  if (options.skill && options.allSkills) {
    throw new ConfigError("--skill and --all-skills cannot be combined.");
  }

  const skillSources = await loadSkillSources(skillsDir);
  const targetSkills = options.allSkills
    ? Object.keys(skillSources).sort()
    : [options.skill!];

  if (targetSkills.length === 0) {
    throw new ConfigError(`No skills found in ${skillsDir}.`);
  }
  for (const skill of targetSkills) {
    if (!skillSources[skill]) {
      throw new ConfigError(`Unknown target skill "${skill}" in ${skillsDir}.`);
    }
  }

  const timestamp = new Date().toISOString();
  const dirStamp = timestamp.replace(/[:.]/g, "-");
  const suffixLabel = options.allSkills ? "all" : options.skill!;
  const outDir =
    options.outDir ??
    join("eval_results", "generated", `${dirStamp}-${suffixLabel}`);
  validateOutDirNotInEvalsDir(outDir, evalsDir);

  const existingCases = existsSync(evalsDir)
    ? (await loadCorpus(evalsDir)).cases
    : [];

  const dryRunSkills: DryRunSkillPlan[] = targetSkills.map((skill) => {
    const skillCases = existingCases.filter((c) => c.target_skill === skill);
    const evalTypeCounts: Record<string, number> = {};
    for (const c of skillCases) {
      evalTypeCounts[c.eval_type] = (evalTypeCounts[c.eval_type] ?? 0) + 1;
    }
    return {
      skill,
      skill_code: deriveSkillCode(skill),
      existing_case_count: skillCases.length,
      eval_type_counts: evalTypeCounts,
      next_synthetic_suffix: allocateNextSyntheticSuffix(existingCases, skill),
      requested_count: options.count,
    };
  });

  if (options.dryRun) {
    return {
      dryRun: true,
      outDir,
      dryRunSkills,
    };
  }

  const preflightFn =
    options.deps?.preflight ??
    ((h: HarnessName, opts?: { structured?: boolean }) =>
      checkHarnessPreflight(h, opts));
  const prepareAuthFn = options.deps?.prepareAuth ?? prepareIsolatedHarnessAuth;
  const invokeStructuredFn =
    options.deps?.invokeStructured ?? invokeStructuredHarness;

  preflightFn(options.harness, { structured: true });

  const workId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const workRoot = `/tmp/chezmoi-gen-${workId}`;
  mkdirSync(workRoot, { recursive: true, mode: 0o700 });
  chmodSync(workRoot, 0o700);

  const authHomeDir = prepareAuthFn(workRoot, options.harness);

  const cleanup = (): void => {
    if (!options.keepWorkdir) {
      rmSync(workRoot, { recursive: true, force: true });
    }
  };
  if (!options.keepWorkdir) {
    process.once("exit", cleanup);
  }

  const existingIds = new Set(existingCases.map((c) => c.id));
  const existingPromptsBySkill = new Map<string, string[]>();
  for (const c of existingCases) {
    const list = existingPromptsBySkill.get(c.target_skill) ?? [];
    list.push(c.input.user_prompt);
    existingPromptsBySkill.set(c.target_skill, list);
  }

  const acceptedRecords: AcceptedCandidateRecord[] = [];
  const rejectedRecords: RejectedCandidateRecord[] = [];
  const errors: Array<{ skill: string; error: string }> = [];
  let abortedEarly = false;
  let abortReason: string | null = null;

  try {
    for (const plan of dryRunSkills) {
      const skillSource = skillSources[plan.skill]!;
      const skillCases = existingCases.filter(
        (c) => c.target_skill === plan.skill,
      );
      const prompt = buildGeneratorPrompt({
        skillSource,
        existingCases: skillCases,
        focus: options.focus,
        count: options.count,
        nextSuffix: plan.next_synthetic_suffix,
      });

      const genWorkDir = join(workRoot, "gen_work", plan.skill);
      const result = await invokeStructuredFn({
        harness: options.harness,
        ...(options.model ? { model: options.model } : {}),
        prompt,
        schema: SyntheticCandidateBatchSchema,
        workDir: genWorkDir,
        authHomeDir,
        timeoutMs,
      });

      if (result.authOrRateLimitError) {
        abortedEarly = true;
        abortReason = result.authOrRateLimitError;
        errors.push({ skill: plan.skill, error: result.authOrRateLimitError });
        break;
      }

      if (!result.ok || !result.data) {
        errors.push({
          skill: plan.skill,
          error: result.error ?? "Failed to parse synthetic candidate batch.",
        });
        continue;
      }

      for (const candidate of result.data.candidates) {
        const validation = validateSyntheticCandidate({
          rawCandidate: candidate.test_case,
          rationale: candidate.rationale,
          skillSources,
          skillsDir,
          existingIds,
          existingPromptsBySkill,
        });

        if (validation.accepted) {
          existingIds.add(validation.testCase.id);
          const list =
            existingPromptsBySkill.get(validation.testCase.target_skill) ?? [];
          list.push(validation.testCase.input.user_prompt);
          existingPromptsBySkill.set(validation.testCase.target_skill, list);
          acceptedRecords.push({
            test_case: validation.testCase,
            rationale: candidate.rationale,
          });
        } else {
          rejectedRecords.push(validation.rejected);
        }
      }
    }
  } finally {
    if (!options.keepWorkdir) {
      process.removeListener("exit", cleanup);
      cleanup();
    }
  }

  mkdirSync(outDir, { recursive: true });
  const accepted = acceptedRecords.map((r) => r.test_case);
  const casesPath = join(outDir, "cases.json");
  const reportPath = join(outDir, "report.md");

  writeFileSync(casesPath, JSON.stringify(accepted, null, 2), "utf-8");
  writeFileSync(
    reportPath,
    formatGeneratorReport({
      timestamp,
      harness: options.harness,
      focus: options.focus,
      outDir,
      acceptedRecords,
      rejectedRecords,
      errors,
      abortedEarly,
      abortReason,
    }),
    "utf-8",
  );

  return {
    dryRun: false,
    outDir,
    accepted,
    acceptedRecords,
    rejectedRecords,
    errors,
    abortedEarly,
    abortReason,
    casesPath,
    reportPath,
  };
};
