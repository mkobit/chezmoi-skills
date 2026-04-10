import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
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
  name: z.string(),
  version: z.string(),
});

type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; name: string; details: string | z.ZodIssue[] };

const getSkillsDirectories = (): string[] => {
  const marketplaceJsonPath = join(claudePluginDir, "marketplace.json");
  if (!existsSync(marketplaceJsonPath)) {
    console.error(`Error: ${marketplaceJsonPath} not found. Cannot determine skills directories.`);
    return [];
  }

  try {
    const content = readFileSync(marketplaceJsonPath, "utf-8");
    const parsed = JSON.parse(content);

    if (!parsed.plugins || !Array.isArray(parsed.plugins)) {
      console.error(`Error: Invalid plugins array in ${marketplaceJsonPath}`);
      return [];
    }

    return parsed.plugins.map((p: any) => {
      const src = p.source || "./";
      return join(claudePluginDir, "..", src, "skills");
    });
  } catch (e) {
    console.error(`Error reading ${marketplaceJsonPath}`, e);
    return [];
  }
};

const validateSkills = (): ValidationResult[] => {
  const allSkillsDirs = getSkillsDirectories();
  if (allSkillsDirs.length === 0) {
    return [{ valid: false, name: "Skills Resolution", details: "Failed to determine any skills directories from plugin config" }];
  }

  const allResults: ValidationResult[] = [];

  R.forEach(allSkillsDirs, (skillsDir) => {
    if (!existsSync(skillsDir)) {
      allResults.push({ valid: false, name: skillsDir, details: "Directory not found" });
      return;
    }

    console.log(`Validating skills directory (${skillsDir})...`);

    const dirs = readdirSync(skillsDir).filter((file) =>
      statSync(join(skillsDir, file)).isDirectory()
    );

    if (dirs.length === 0) {
      allResults.push({ valid: false, name: skillsDir, details: "No skills found in directory" });
      return;
    }

    const dirResults = R.map(dirs, (dir): ValidationResult => {
      const skillMdPath = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillMdPath)) {
        return { valid: false, name: dir, details: "Missing SKILL.md" };
      }
      try {
        const content = readFileSync(skillMdPath, "utf-8");
        const { data } = matter(content);
        skillSchema.parse(data);
        return { valid: true, name: dir };
      } catch (e) {
        if (e instanceof z.ZodError) {
          return { valid: false, name: dir, details: e.errors };
        }
        return { valid: false, name: dir, details: String(e) };
      }
    });

    allResults.push(...dirResults);
  });

  return allResults;
};

const validatePlugins = (): ValidationResult[] => {
  if (!existsSync(claudePluginDir)) {
      return [{ valid: false, name: claudePluginDir, details: "Claude plugin directory not found" }];
  }

  console.log(`Validating Claude plugin JSON files (${claudePluginDir})...`);
  const files = readdirSync(claudePluginDir).filter(f => f.endsWith('.json'));

  const jsonSchema = z.record(z.any());

  return R.map(files, (file): ValidationResult => {
    const filePath = join(claudePluginDir, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      jsonSchema.parse(JSON.parse(content));
      return { valid: true, name: file };
    } catch (e) {
      if (e instanceof z.ZodError) {
        return { valid: false, name: file, details: e.errors };
      }
      return { valid: false, name: file, details: "Invalid JSON format" };
    }
  });
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

const skillResults = validateSkills();
const pluginResults = validatePlugins();

const failed = handleResults([...skillResults, ...pluginResults]);

if (failed) {
  process.exit(1);
} else {
  console.log("All validations passed!");
}
