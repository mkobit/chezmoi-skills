import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import type { ValidationResult } from "./types";
import { checkSingleSentencePerLine } from "./prose";
import { checkInternalLinks } from "./links";

export const skillSchema = z.object({
  name: z.string().max(64, "name must be 64 characters or less"),
  description: z.string().max(1024, "description must be 1024 characters or less"),
});

export const getSkillsDirectories = async (claudePluginDir: string = ".claude-plugin"): Promise<string[]> => {
  const marketplaceJsonPath = join(claudePluginDir, "marketplace.json");
  if (!existsSync(marketplaceJsonPath)) {
    console.error(`Error: ${marketplaceJsonPath} not found. Cannot determine skills directories.`);
    return [];
  }

  const contentResult = await readFile(marketplaceJsonPath, "utf-8").catch(() => null);
  if (!contentResult) {
    console.error(`Error reading ${marketplaceJsonPath}`);
    return [];
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(contentResult);
  } catch (e) {
    console.error(`Error: Invalid JSON format in ${marketplaceJsonPath}`);
    return [];
  }

  const parsedResult = z.object({
    plugins: z.array(z.object({ source: z.string().optional() }).passthrough()),
  }).passthrough().safeParse(parsedJson);

  if (!parsedResult.success) {
    console.error(`Error: Invalid plugins array in ${marketplaceJsonPath}`);
    return [];
  }

  return parsedResult.data.plugins.map((p: any) => {
    const src = p.source || "./";
    return join(claudePluginDir, "..", src, "skills");
  });
};

export const getMarkdownFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const filesPromises = entries.map(async (entry) => {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return getMarkdownFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      return [fullPath];
    }
    return [];
  });
  const results = await Promise.all(filesPromises);
  return results.flat();
};

export const validateSkillDir = async (skillsDir: string, dir: string): Promise<ValidationResult[]> => {
  const results: ValidationResult[] = [];
  const skillMdPath = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return [{ valid: false, name: dir, details: "Missing SKILL.md" }];
  }

  const contentResult = await readFile(skillMdPath, "utf-8").catch((e) => e);
  if (contentResult instanceof Error) {
    return [{ valid: false, name: dir, details: String(contentResult) }];
  }

  const { data } = matter(contentResult);
  const parsed = skillSchema.safeParse(data);

  if (!parsed.success) {
    results.push({ valid: false, name: `${dir}/SKILL.md frontmatter`, details: parsed.error.issues });
  } else {
    results.push({ valid: true, name: `${dir}/SKILL.md frontmatter` });
  }

  const mdFiles = await getMarkdownFiles(join(skillsDir, dir));

  for (const file of mdFiles) {
    const relPath = file.substring(skillsDir.length + 1);
    const fileContent = await readFile(file, "utf-8").catch(() => null);
    if (fileContent === null) {
      results.push({ valid: false, name: relPath, details: "Failed to read file" });
      continue;
    }

    const proseErrors = checkSingleSentencePerLine(fileContent);
    if (proseErrors.length > 0) {
      results.push({ valid: false, name: `${relPath} prose rule`, details: proseErrors.join("; ") });
    } else {
      results.push({ valid: true, name: `${relPath} prose rule` });
    }

    const linkErrors = checkInternalLinks(fileContent, file);
    if (linkErrors.length > 0) {
      results.push({ valid: false, name: `${relPath} internal links`, details: linkErrors.join("; ") });
    } else {
      results.push({ valid: true, name: `${relPath} internal links` });
    }

    const { content: bodyContent } = matter(fileContent);
    const bodyTokens = encode(bodyContent).length;
    const isSkillMd = file.endsWith("SKILL.md");

    if (isSkillMd) {
      const descTokens = encode(data.description || "").length;
      if (descTokens > 100) {
        results.push({ valid: false, name: `${relPath} description token budget`, details: `Description token count (${descTokens}) exceeds max budget of 100 tokens` });
      } else {
        results.push({ valid: true, name: `${relPath} description token budget (${descTokens} <= 100)` });
      }

      if (bodyTokens > 600) {
        results.push({ valid: false, name: `${relPath} body token budget`, details: `SKILL.md body token count (${bodyTokens}) exceeds max budget of 600 tokens` });
      } else {
        results.push({ valid: true, name: `${relPath} body token budget (${bodyTokens} <= 600)` });
      }
    } else {
      if (bodyTokens > 1500) {
        results.push({ valid: false, name: `${relPath} L3 reference token budget`, details: `L3 reference file token count (${bodyTokens}) exceeds max budget of 1500 tokens` });
      } else {
        results.push({ valid: true, name: `${relPath} L3 reference token budget (${bodyTokens} <= 1500)` });
      }
    }
  }

  return results;
};

export const validateSkills = async (claudePluginDir: string = ".claude-plugin"): Promise<ValidationResult[]> => {
  const allSkillsDirs = await getSkillsDirectories(claudePluginDir);
  if (allSkillsDirs.length === 0) {
    return [{ valid: false, name: "Skills Resolution", details: "Failed to determine any skills directories from plugin config" }];
  }

  const allResultsPromises = allSkillsDirs.map(async (skillsDir) => {
    if (!existsSync(skillsDir)) {
      return [{ valid: false, name: skillsDir, details: "Directory not found" }];
    }

    console.log(`Validating skills directory (${skillsDir})...`);

    const files = await readdir(skillsDir).catch(() => []);
    const dirsPromises = files.map(async (file) => {
      const isDir = await stat(join(skillsDir, file)).then((s) => s.isDirectory()).catch(() => false);
      return isDir ? file : null;
    });

    const dirs = (await Promise.all(dirsPromises)).filter(Boolean) as string[];

    if (dirs.length === 0) {
      return [{ valid: false, name: skillsDir, details: "No skills found in directory" }];
    }

    const dirResultsPromises = dirs.map((dir) => validateSkillDir(skillsDir, dir));
    const nestedResults = await Promise.all(dirResultsPromises);
    return nestedResults.flat();
  });

  const resolvedArrayOfArrays = await Promise.all(allResultsPromises);
  return resolvedArrayOfArrays.flat();
};
