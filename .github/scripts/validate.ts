import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";
import { z } from "zod";

const skillsDir = "skills";
const claudePluginDir = ".claude-plugin";
let failed = false;

// 1. Validate SKILL.md and Frontmatter
const skillSchema = z.object({
  name: z.string(),
  version: z.string(),
});

if (existsSync(skillsDir)) {
  console.log("Validating skills directory...");
  const dirs = readdirSync(skillsDir).filter((file) =>
    statSync(join(skillsDir, file)).isDirectory()
  );

  for (const dir of dirs) {
    const skillMdPath = join(skillsDir, dir, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      console.error(`Error: Skill directory ${dir} is missing SKILL.md`);
      failed = true;
      continue;
    }

    let content = "";
    try {
      content = readFileSync(skillMdPath, "utf-8");
    } catch (e) {
      console.error(`Error: Could not read ${skillMdPath}`);
      failed = true;
      continue;
    }

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      console.error(`Error: Missing frontmatter in ${skillMdPath}`);
      failed = true;
      continue;
    }

    try {
      const data = yaml.parse(match[1]);
      skillSchema.parse(data);
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error(`Error: Invalid frontmatter schema in ${skillMdPath}`, e.errors);
      } else {
        console.error(`Error: Invalid YAML frontmatter in ${skillMdPath}`);
      }
      failed = true;
    }
  }
} else {
  console.error(`Error: ${skillsDir} directory not found.`);
  failed = true;
}

// 2. Validate Claude Plugin JSON
if (existsSync(claudePluginDir)) {
  console.log("Validating Claude plugin JSON files...");
  const files = readdirSync(claudePluginDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = join(claudePluginDir, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      JSON.parse(content);
    } catch (e) {
      console.error(`Error: Invalid JSON in ${filePath}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("Validation successful!");
}
