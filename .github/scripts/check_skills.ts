import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";

const skillsDir = "skills";

const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    version: { type: "string" },
  },
  required: ["name", "version"],
};

function validateAgainstSchema(data: any) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  for (const key of schema.required) {
    if (!(key in data)) return false;
    if (typeof data[key] !== (schema.properties as any)[key].type) return false;
  }
  return true;
}

let failed = false;

const dirs = readdirSync(skillsDir).filter((file) =>
  statSync(join(skillsDir, file)).isDirectory()
);

for (const dir of dirs) {
  const skillMdPath = join(skillsDir, dir, "SKILL.md");
  let content = "";
  try {
    content = readFileSync(skillMdPath, "utf-8");
  } catch (e) {
    console.error(`Error: Missing ${skillMdPath}`);
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
    if (!validateAgainstSchema(data)) {
      console.error(`Error: Invalid frontmatter schema in ${skillMdPath}`);
      failed = true;
    }
  } catch (e) {
    console.error(`Error: Invalid YAML frontmatter in ${skillMdPath}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("All skills validated successfully!");
}
