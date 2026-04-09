import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";
import { z } from "zod";
import { Command } from "commander";
import * as R from "remeda";

const program = new Command();

program
  .option('--skills-dir <dir>', 'Directory containing skills', 'skills')
  .option('--claude-plugin-dir <dir>', 'Directory containing claude plugin configs', '.claude-plugin')
  .parse(process.argv);

const options = program.opts();
const skillsDir = options.skillsDir;
const claudePluginDir = options.claudePluginDir;

const skillSchema = z.object({
  name: z.string(),
  version: z.string(),
});

const pluginSchema = z.object({}).passthrough();

const validateSkills = (): boolean => {
  if (!existsSync(skillsDir)) {
    console.error(`Error: ${skillsDir} directory not found.`);
    return false;
  }

  console.log(`Validating skills directory (${skillsDir})...`);
  const dirs = readdirSync(skillsDir).filter((file) =>
    statSync(join(skillsDir, file)).isDirectory()
  );

  const results = R.pipe(
    dirs,
    R.map((dir) => {
      const skillMdPath = join(skillsDir, dir, "SKILL.md");
      if (!existsSync(skillMdPath)) {
        console.error(`Error: Skill directory ${dir} is missing SKILL.md`);
        return false;
      }
      try {
        const content = readFileSync(skillMdPath, "utf-8");
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) {
          console.error(`Error: Missing frontmatter in ${skillMdPath}`);
          return false;
        }
        const data = yaml.parse(match[1]);
        skillSchema.parse(data);
        return true;
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error(`Error: Invalid frontmatter schema in ${skillMdPath}`, e.errors);
        } else {
          console.error(`Error: Invalid YAML frontmatter in ${skillMdPath}`);
        }
        return false;
      }
    })
  );
  return results.every(Boolean);
};

const validatePlugins = (): boolean => {
  if (!existsSync(claudePluginDir)) return true;

  console.log(`Validating Claude plugin JSON files (${claudePluginDir})...`);
  const files = readdirSync(claudePluginDir).filter(f => f.endsWith('.json'));

  const results = R.pipe(
    files,
    R.map((file) => {
      const filePath = join(claudePluginDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        pluginSchema.parse(parsed);
        return true;
      } catch (e) {
        console.error(`Error: Invalid JSON in ${filePath}`);
        return false;
      }
    })
  );
  return results.every(Boolean);
};

const skillsValid = validateSkills();
const pluginsValid = validatePlugins();

if (!skillsValid || !pluginsValid) {
  process.exit(1);
} else {
  console.log("Validation successful!");
}
