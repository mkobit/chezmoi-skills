import { existsSync } from "fs";
import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Command } from "commander";

const program = new Command();

program
  .option('--claude-plugin-dir <dir>', 'Directory containing claude plugin configs', '.claude-plugin')
  .parse(process.argv);

const options = program.opts();
const claudePluginDir = options.claudePluginDir;

const skillSchema = z.object({
  name: z.string(),
  version: z.string(),
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

const validateSkillDir = async (skillsDir: string, dir: string): Promise<ValidationResult> => {
  const skillMdPath = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return { valid: false, name: dir, details: "Missing SKILL.md" };
  }

  const contentResult = await readFile(skillMdPath, "utf-8").catch(e => e);
  if (contentResult instanceof Error) {
    return { valid: false, name: dir, details: String(contentResult) };
  }

  const { data } = matter(contentResult);
  const parsed = skillSchema.safeParse(data);

  if (!parsed.success) {
    return { valid: false, name: dir, details: parsed.error.errors };
  }

  return { valid: true, name: dir };
};

const validateSkills = async (): Promise<ValidationResult[]> => {
  const allSkillsDirs = await getSkillsDirectories();
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
      const isDir = await stat(join(skillsDir, file)).then(s => s.isDirectory()).catch(() => false);
      return isDir ? file : null;
    });

    const dirs = (await Promise.all(dirsPromises)).filter(Boolean) as string[];

    if (dirs.length === 0) {
      return [{ valid: false, name: skillsDir, details: "No skills found in directory" }];
    }

    const dirResultsPromises = dirs.map((dir) => validateSkillDir(skillsDir, dir));
    return Promise.all(dirResultsPromises);
  });

  const resolvedArrayOfArrays = await Promise.all(allResultsPromises);
  return resolvedArrayOfArrays.flat();
};

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

  const schemaResult = z.record(z.string(), z.any()).safeParse(parsedJson);
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

  const resultsPromises = jsonFiles.map((file) => {
    const filePath = join(claudePluginDir, file);
    return validatePluginFile(filePath, file);
  });

  return Promise.all(resultsPromises);
};

const handleResults = (results: ValidationResult[]) => {
  let hasErrors = false;
  results.forEach((res) => {
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

  const failed = handleResults([...skillResults, ...pluginResults]);

  if (failed) {
    process.exit(1);
  } else {
    console.log("All validations passed!");
  }
};

run();
