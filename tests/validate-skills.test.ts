import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { validateSkillDir } from "../scripts/skills/validate/skills";

const temporaryDirectories: string[] = [];

const createSkillFixture = (openaiYamlContent?: string) => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-skill-"));
  temporaryDirectories.push(root);
  const skillDir = join(root, "example-skill");
  mkdirSync(skillDir);
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "---\nname: example-skill\ndescription: Test skill.\n---\n\nTest instructions.\n",
  );

  if (openaiYamlContent !== undefined) {
    mkdirSync(join(skillDir, "agents"));
    writeFileSync(join(skillDir, "agents", "openai.yaml"), openaiYamlContent);
  }

  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (existsSync(directory)) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("validateSkillDir", () => {
  it("accepts a skill with a valid agents/openai.yaml display_name", async () => {
    const skillsDir = createSkillFixture(
      'interface:\n  display_name: "Example skill"\n',
    );
    const results = await validateSkillDir(skillsDir, "example-skill");

    expect(results).toContainEqual({
      valid: true,
      name: "example-skill/agents/openai.yaml",
    });
  });

  it("rejects a skill missing agents/openai.yaml", async () => {
    const skillsDir = createSkillFixture();
    const results = await validateSkillDir(skillsDir, "example-skill");

    expect(results).toContainEqual({
      valid: false,
      name: "example-skill/agents/openai.yaml",
      details: "Missing agents/openai.yaml",
    });
  });

  it("rejects a skill with an empty or missing interface.display_name", async () => {
    const skillsDir = createSkillFixture('interface:\n  display_name: "   "\n');
    const results = await validateSkillDir(skillsDir, "example-skill");
    const result = results.find(
      (entry) => entry.name === "example-skill/agents/openai.yaml",
    );

    expect(result?.valid).toBe(false);
  });
});
