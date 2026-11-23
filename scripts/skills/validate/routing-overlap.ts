import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { getSkillsDirectories } from "./skills";
import type { ValidationResult } from "./types";

export interface SkillRoutingEntry {
  name: string;
  description: string;
  sourcePath: string;
}

export interface RoutingOverlapOptions {
  /** Maximum allowed Jaccard similarity of meaningful tokens (0..1). */
  maxJaccard?: number;
  /** Minimum shared meaningful tokens required before Jaccard threshold applies. */
  minSharedTokens?: number;
  /** Length of meaningful-token n-grams treated as duplicate trigger phrases. */
  phraseLength?: number;
}

const DEFAULT_MAX_JACCARD = 0.45;
const DEFAULT_MIN_SHARED_TOKENS = 3;
const DEFAULT_PHRASE_LENGTH = 3;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "this",
  "to",
  "use",
  "used",
  "using",
  "when",
  "where",
  "with",
]);

const SHARED_DOMAIN_TERMS = new Set([
  "chezmoi",
  "dotfile",
  "dotfiles",
  "etc",
  "file",
  "files",
  "format",
  "include",
  "including",
  "manage",
  "managing",
]);

const normalizeText = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

/** Extract ordered meaningful tokens from a skill description for overlap checks. */
export const extractRoutingTokens = (description: string): string[] => {
  const matches = description.toLowerCase().match(/[a-z0-9_.-]+/g) ?? [];
  return matches
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .filter(
      (token) =>
        token.length > 1 &&
        !STOP_WORDS.has(token) &&
        !SHARED_DOMAIN_TERMS.has(token),
    );
};

const extractNgrams = (tokens: string[], size: number): Set<string> => {
  const ngrams = new Set<string>();
  for (let i = 0; i <= tokens.length - size; i++) {
    ngrams.add(tokens.slice(i, i + size).join(" "));
  }
  return ngrams;
};

/** Find routing overlap issues across a set of skill descriptions. */
export const findRoutingOverlaps = (
  skills: SkillRoutingEntry[],
  options: RoutingOverlapOptions = {},
): string[] => {
  const maxJaccard = options.maxJaccard ?? DEFAULT_MAX_JACCARD;
  const minSharedTokens = options.minSharedTokens ?? DEFAULT_MIN_SHARED_TOKENS;
  const phraseLength = options.phraseLength ?? DEFAULT_PHRASE_LENGTH;

  const issues: string[] = [];
  const prepared = skills.map((skill) => {
    const tokens = extractRoutingTokens(skill.description);
    return {
      skill,
      normalized: normalizeText(skill.description),
      tokenSet: new Set(tokens),
      ngrams: extractNgrams(tokens, phraseLength),
    };
  });

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]!;
      const b = prepared[j]!;
      const pairLabel = `${a.skill.name} <-> ${b.skill.name}`;

      if (a.normalized.length > 0 && a.normalized === b.normalized) {
        issues.push(`${pairLabel}: duplicate SKILL.md description`);
        continue;
      }

      const sharedPhrases = [...a.ngrams].filter((phrase) =>
        b.ngrams.has(phrase),
      );
      if (sharedPhrases.length > 0) {
        issues.push(
          `${pairLabel}: shared trigger phrase(s): ${sharedPhrases.map((p) => `"${p}"`).join(", ")}`,
        );
        continue;
      }

      const sharedTokens = [...a.tokenSet].filter((token) =>
        b.tokenSet.has(token),
      );
      const unionSize = new Set([...a.tokenSet, ...b.tokenSet]).size;
      const jaccard = unionSize === 0 ? 0 : sharedTokens.length / unionSize;

      if (sharedTokens.length >= minSharedTokens && jaccard >= maxJaccard) {
        issues.push(
          `${pairLabel}: high keyword overlap (${(jaccard * 100).toFixed(0)}% Jaccard, shared: ${sharedTokens.join(", ")})`,
        );
      }
    }
  }

  return issues;
};

const loadSkillRoutingEntries = async (
  skillsDirs: string[],
): Promise<SkillRoutingEntry[]> => {
  const entries: SkillRoutingEntry[] = [];

  for (const skillsDir of skillsDirs) {
    if (!existsSync(skillsDir)) continue;
    const dirs = await readdir(skillsDir, { withFileTypes: true }).catch(
      () => [],
    );

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const skillMdPath = join(skillsDir, dir.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;

      const content = await readFile(skillMdPath, "utf-8").catch(() => null);
      if (!content) continue;

      const { data } = matter(content);
      if (
        typeof data.name === "string" &&
        typeof data.description === "string"
      ) {
        entries.push({
          name: data.name,
          description: data.description,
          sourcePath: skillMdPath,
        });
      }
    }
  }

  return entries;
};

/** Validate cross-skill SKILL.md description and trigger overlap. */
export const validateRoutingOverlap = async (
  claudePluginDir: string = ".claude-plugin",
  options: RoutingOverlapOptions = {},
): Promise<ValidationResult[]> => {
  const skillsDirs = await getSkillsDirectories(claudePluginDir);
  const entries = await loadSkillRoutingEntries(skillsDirs);

  if (entries.length === 0) {
    return [
      {
        valid: false,
        name: "cross-skill routing overlap",
        details: "No skills found to check routing overlap",
      },
    ];
  }

  const issues = findRoutingOverlaps(entries, options);
  if (issues.length > 0) {
    return [
      {
        valid: false,
        name: "cross-skill routing overlap",
        details: issues.join("; "),
      },
    ];
  }

  return [
    {
      valid: true,
      name: `cross-skill routing overlap (${entries.length} skills checked)`,
    },
  ];
};
