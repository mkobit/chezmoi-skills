import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import type { ValidationResult } from "./types";
import { getSkillsDirectories } from "./skills";

export const validateContractCoverage = async (claudePluginDir: string = ".claude-plugin"): Promise<ValidationResult[]> => {
  const results: ValidationResult[] = [];
  const evalsDir = "tests/evals";

  const allSkillsDirs = await getSkillsDirectories(claudePluginDir);
  const knownSkillNames = new Set<string>();

  for (const skillsDir of allSkillsDirs) {
    if (!existsSync(skillsDir)) continue;
    const files = await readdir(skillsDir).catch(() => []);
    for (const file of files) {
      const skillMdPath = join(skillsDir, file, "SKILL.md");
      if (existsSync(skillMdPath)) {
        const content = await readFile(skillMdPath, "utf-8").catch(() => null);
        if (content) {
          const { data } = matter(content);
          if (data.name) {
            knownSkillNames.add(data.name);
          }
        }
      }
    }
  }

  if (knownSkillNames.size === 0) {
    return [{ valid: false, name: "contract test coverage", details: "No skills found to validate coverage against" }];
  }

  if (!existsSync(evalsDir)) {
    return [{ valid: false, name: "contract test coverage", details: `Evals directory "${evalsDir}" not found` }];
  }

  const evalFiles = (await readdir(evalsDir).catch(() => [])).filter((f) => f.endsWith(".json"));
  if (evalFiles.length === 0) {
    return [{ valid: false, name: "contract test coverage", details: `No eval test files found in "${evalsDir}"` }];
  }

  const testedSkillCounts = new Map<string, number>();
  const testIds = new Set<string>();
  const duplicateIds: string[] = [];
  const orphanedSkills = new Set<string>();

  for (const file of evalFiles) {
    const fullPath = join(evalsDir, file);
    const content = await readFile(fullPath, "utf-8").catch(() => null);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      const testCases = Array.isArray(parsed) ? parsed : [parsed];
      for (const tc of testCases) {
        if (tc.id) {
          if (testIds.has(tc.id)) {
            duplicateIds.push(tc.id);
          } else {
            testIds.add(tc.id);
          }
        }
        if (tc.target_skill) {
          if (knownSkillNames.has(tc.target_skill)) {
            testedSkillCounts.set(tc.target_skill, (testedSkillCounts.get(tc.target_skill) || 0) + 1);
          } else {
            orphanedSkills.add(tc.target_skill);
          }
        }
      }
    } catch (e) {
      results.push({ valid: false, name: `evals file format (${file})`, details: `Invalid JSON format: ${String(e)}` });
    }
  }

  const untestedSkills = Array.from(knownSkillNames).filter((s) => !testedSkillCounts.has(s) || testedSkillCounts.get(s)! === 0);

  if (untestedSkills.length > 0) {
    results.push({
      valid: false,
      name: "contract test coverage parity",
      details: `Skills missing contract test coverage: ${untestedSkills.join(", ")}`,
    });
  } else {
    results.push({
      valid: true,
      name: `contract test coverage parity (${knownSkillNames.size}/${knownSkillNames.size} skills covered)`,
    });
  }

  if (orphanedSkills.size > 0) {
    results.push({
      valid: false,
      name: "contract test orphaned target skills",
      details: `Test cases reference unknown skill names: ${Array.from(orphanedSkills).join(", ")}`,
    });
  } else {
    results.push({
      valid: true,
      name: "contract test orphaned target skills (0 orphaned references)",
    });
  }

  if (duplicateIds.length > 0) {
    results.push({
      valid: false,
      name: "contract test ID uniqueness",
      details: `Duplicate test case IDs found: ${duplicateIds.join(", ")}`,
    });
  } else {
    results.push({
      valid: true,
      name: `contract test ID uniqueness (${testIds.size} unique test IDs)`,
    });
  }

  return results;
};
