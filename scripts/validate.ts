import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join, dirname } from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Command } from "commander";
import * as R from "remeda";

const program = new Command();

program
  .option('--claude-plugin-dir <dir>', 'Directory containing claude plugin configs', '.claude-plugin')
  .parse(process.argv);

const options = program.opts();
const claudePluginDir = options.claudePluginDir;

const skillSchema = z.object({
  name: z.string().max(64, "name must be 64 characters or less"),
  description: z.string().max(1024, "description must be 1024 characters or less"),
});

type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; name: string; details: string | z.ZodIssue[] };

const getSkillsDirectories = async (): Promise<string[]> => {
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
    plugins: z.array(z.object({ source: z.string().optional() }).passthrough())
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

const getMarkdownFiles = async (dirPath: string): Promise<string[]> => {
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

const checkSingleSentencePerLine = (content: string): string[] => {
  const lines = content.split("\n");
  const errors: string[] = [];

  let inFrontmatter = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }

    if (!trimmed) {
      continue;
    }

    const snippets = trimmed.includes("|")
      ? trimmed.split("|").map(cell => cell.trim()).filter(Boolean)
      : [trimmed];

    for (const snippet of snippets) {
      let clean = snippet
        .replace(/^#+\s*/, "")
        .replace(/^>\s*/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "");

      clean = clean.replace(/`[^`]+`/g, " ");
      clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      clean = clean.replace(/https?:\/\/\S+/g, " ");
      clean = clean.replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.|v\d+(\.\d+)*|no\.|dr\.|mr\.|ms\.|inc\.|corp\.|ltd\.|st\.|fig\.|approx\.|dept\.)/gi, " ");
      clean = clean.replace(/\d+\.\d+/g, " ");
      clean = clean.replace(/\.\.\./g, " ").replace(/\.\./g, " ");

      if (/[.!?][)'"\]`]*\s+\S/.test(clean)) {
        errors.push(`Line ${i + 1}: Multiple sentences found on a single line: "${line}"`);
        break;
      }
    }
  }

  return errors;
};

const checkInternalLinks = (content: string, filePath: string): string[] => {
  const lines = content.split("\n");
  const errors: string[] = [];

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      continue;
    }

    const linkRegex = /\[(?:[^\]]|\\\])*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[1];
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("ftp://") ||
        rawTarget.startsWith("#")
      ) {
        continue;
      }

      const targetPathWithoutAnchor = rawTarget.split("#")[0];
      if (!targetPathWithoutAnchor) {
        continue;
      }

      const absoluteTarget = join(dirname(filePath), targetPathWithoutAnchor);
      if (!existsSync(absoluteTarget)) {
        errors.push(`Line ${i + 1}: Referenced link target "${rawTarget}" does not exist (${absoluteTarget})`);
      }
    }
  }

  return errors;
};

const validateSkillDir = async (skillsDir: string, dir: string): Promise<ValidationResult[]> => {
  const results: ValidationResult[] = [];
  const skillMdPath = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return [{ valid: false, name: dir, details: "Missing SKILL.md" }];
  }

  const contentResult = await readFile(skillMdPath, "utf-8").catch(e => e);
  if (contentResult instanceof Error) {
    return [{ valid: false, name: dir, details: String(contentResult) }];
  }

  const { data } = matter(contentResult);
  const parsed = skillSchema.safeParse(data);

  if (!parsed.success) {
    results.push({ valid: false, name: `${dir}/SKILL.md frontmatter`, details: parsed.error.errors });
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
  }

  return results;
};

const validateSkills = async (): Promise<ValidationResult[]> => {
  const allSkillsDirs = await getSkillsDirectories();
  if (allSkillsDirs.length === 0) {
    return [{ valid: false, name: "Skills Resolution", details: "Failed to determine any skills directories from plugin config" }];
  }

  const allResultsPromises = R.map(allSkillsDirs, async (skillsDir) => {
    if (!existsSync(skillsDir)) {
      return [{ valid: false, name: skillsDir, details: "Directory not found" }];
    }

    console.log(`Validating skills directory (${skillsDir})...`);

    const files = await readdir(skillsDir).catch(() => []);
    const dirsPromises = R.map(files, async (file) => {
      const isDir = await stat(join(skillsDir, file)).then(s => s.isDirectory()).catch(() => false);
      return isDir ? file : null;
    });

    const dirs = (await Promise.all(dirsPromises)).filter(Boolean) as string[];

    if (dirs.length === 0) {
      return [{ valid: false, name: skillsDir, details: "No skills found in directory" }];
    }

    const dirResultsPromises = R.map(dirs, (dir) => validateSkillDir(skillsDir, dir));
    const nestedResults = await Promise.all(dirResultsPromises);
    return nestedResults.flat();
  });

  const resolvedArrayOfArrays = await Promise.all(allResultsPromises);
  return resolvedArrayOfArrays.flat();
};

const pluginJsonSchema = z.object({
  name: z.string().min(1, "name is required"),
  version: z.string().min(1, "version is required"),
  description: z.string().optional(),
  author: z.union([
    z.string(),
    z.object({ name: z.string(), url: z.string().optional() })
  ]).optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

const marketplaceJsonSchema = z.object({
  name: z.string().min(1, "name is required"),
  plugins: z.array(
    z.object({
      name: z.string().min(1, "plugin name is required"),
      source: z.string().min(1, "plugin source is required"),
      description: z.string().optional(),
      version: z.string().min(1, "plugin version is required"),
    }).passthrough()
  ).min(1, "at least one plugin entry is required"),
}).passthrough();

const validatePluginFile = async (filePath: string, file: string): Promise<ValidationResult> => {
  const contentResult = await readFile(filePath, "utf-8").catch(e => e);
  if (contentResult instanceof Error) {
    return { valid: false, name: file, details: String(contentResult) };
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(contentResult);
  } catch (e) {
    return { valid: false, name: file, details: "Invalid JSON format" };
  }

  const schema = file === "plugin.json"
    ? pluginJsonSchema
    : file === "marketplace.json"
    ? marketplaceJsonSchema
    : z.record(z.string(), z.any());

  const schemaResult = schema.safeParse(parsedJson);
  if (!schemaResult.success) {
    return { valid: false, name: file, details: schemaResult.error.errors };
  }
  return { valid: true, name: file };
};

const validatePlugins = async (): Promise<ValidationResult[]> => {
  if (!existsSync(claudePluginDir)) {
      return [{ valid: false, name: claudePluginDir, details: "Claude plugin directory not found" }];
  }

  console.log(`Validating Claude plugin JSON files (${claudePluginDir})...`);
  const files = await readdir(claudePluginDir).catch(() => []);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const resultsPromises = R.map(jsonFiles, (file) => {
    const filePath = join(claudePluginDir, file);
    return validatePluginFile(filePath, file);
  });

  return Promise.all(resultsPromises);
};

const validateVersionSync = async (): Promise<ValidationResult[]> => {
  const name = "version sync";
  const readJson = async (path: string) => JSON.parse(await readFile(path, "utf-8"));

  try {
    const plugin = await readJson(join(claudePluginDir, "plugin.json"));
    const marketplace = await readJson(join(claudePluginDir, "marketplace.json"));
    const releaseManifest = await readJson(".release-please-manifest.json");
    const pkg = await readJson("package.json");

    const rootVersion = releaseManifest["."] ?? plugin.version;

    const versions = [
      { source: ".release-please-manifest.json", version: releaseManifest["."] },
      { source: "plugin.json", version: plugin.version },
      { source: "package.json", version: pkg.version },
      ...(marketplace.plugins ?? []).map((p: any, i: number) => ({
        source: `marketplace.json plugins[${i}]`,
        version: p.version,
      })),
    ];

    const mismatched = versions.filter(v => v.version !== rootVersion);
    if (mismatched.length > 0) {
      const details = versions.map(v => `${v.source}=${v.version}`).join(", ");
      return [{ valid: false, name, details: `Versions out of sync: ${details}` }];
    }
    return [{ valid: true, name: `${name} (${rootVersion})` }];
  } catch (e) {
    return [{ valid: false, name: `${name}`, details: String(e) }];
  }
};

const handleResults = (results: ValidationResult[]) => {
  let hasErrors = false;
  R.forEach(results, (res) => {
    if (!res.valid) {
      console.error(`❌ Validation failed for ${res.name}:`, res.details);
      hasErrors = true;
    } else {
      console.log(`✅ Validated ${res.name}`);
    }
  });
  return hasErrors;
};

const run = async () => {
  const skillResults = await validateSkills();
  const pluginResults = await validatePlugins();
  const versionResults = await validateVersionSync();

  const failed = handleResults([...skillResults, ...pluginResults, ...versionResults]);

  if (failed) {
    process.exit(1);
  } else {
    console.log("All validations passed!");
  }
};

run();
