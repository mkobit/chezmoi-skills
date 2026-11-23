import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  extractRoutingTokens,
  findRoutingOverlaps,
  validateRoutingOverlap,
} from "../scripts/skills/validate/routing-overlap";

const temporaryDirectories: string[] = [];

const createTempPluginFixture = (
  skills: Array<{ name: string; description: string }>,
): string => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-routing-"));
  temporaryDirectories.push(root);

  const claudePluginDir = join(root, ".claude-plugin");
  const skillsDir = join(root, "skills");
  mkdirSync(claudePluginDir);
  mkdirSync(skillsDir);

  writeFileSync(
    join(claudePluginDir, "marketplace.json"),
    JSON.stringify({ plugins: [{ name: "test", source: "./" }] }),
  );

  for (const skill of skills) {
    const skillDir = join(skillsDir, skill.name);
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\nBody.\n`,
    );
  }

  return claudePluginDir;
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const dir = temporaryDirectories.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("extractRoutingTokens", () => {
  it("filters stop words and shared domain terms", () => {
    const tokens = extractRoutingTokens(
      "Manage chezmoi dotfiles using encrypted age files.",
    );
    expect(tokens).toEqual(["encrypted", "age"]);
  });
});

describe("findRoutingOverlaps", () => {
  it("flags identical normalized descriptions", () => {
    const issues = findRoutingOverlaps([
      {
        name: "skill-a",
        description: "Manage encrypted files using age or gpg.",
        sourcePath: "skills/skill-a/SKILL.md",
      },
      {
        name: "skill-b",
        description: "  manage encrypted files using age or gpg. ",
        sourcePath: "skills/skill-b/SKILL.md",
      },
    ]);

    expect(issues).toEqual([
      "skill-a <-> skill-b: duplicate SKILL.md description",
    ]);
  });

  it("flags shared multi-word trigger phrases", () => {
    const issues = findRoutingOverlaps([
      {
        name: "skill-a",
        description:
          "Integrate with password managers Bitwarden and 1Password for secrets.",
        sourcePath: "skills/skill-a/SKILL.md",
      },
      {
        name: "skill-b",
        description:
          "Configure password managers Bitwarden and 1Password rotation.",
        sourcePath: "skills/skill-b/SKILL.md",
      },
    ]);

    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("shared trigger phrase(s)");
    expect(issues[0]).toContain("password managers bitwarden");
  });

  it("flags excessive keyword overlap via Jaccard similarity", () => {
    const issues = findRoutingOverlaps([
      {
        name: "skill-a",
        description: "Configure hooks, tools, git, and template data.",
        sourcePath: "skills/skill-a/SKILL.md",
      },
      {
        name: "skill-b",
        description: "Inspect template data, git, hooks, and tools.",
        sourcePath: "skills/skill-b/SKILL.md",
      },
    ]);

    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("high keyword overlap");
  });

  it("allows distinct skills sharing only generic domain terms", () => {
    const issues = findRoutingOverlaps([
      {
        name: "chezmoi-init",
        description:
          "Bootstrap chezmoi on a new machine or clone an existing dotfiles repo.",
        sourcePath: "skills/chezmoi-init/SKILL.md",
      },
      {
        name: "chezmoi-templating",
        description:
          "Write chezmoi templates using Go text/template syntax and Sprig functions.",
        sourcePath: "skills/chezmoi-templating/SKILL.md",
      },
    ]);

    expect(issues).toEqual([]);
  });
});

describe("validateRoutingOverlap", () => {
  it("passes on the repository skills", async () => {
    const results = await validateRoutingOverlap(".claude-plugin");
    expect(results.length).toBe(1);
    expect(results[0]?.valid).toBe(true);
  });

  it("fails when fixture skills have overlapping descriptions", async () => {
    const claudePluginDir = createTempPluginFixture([
      {
        name: "skill-one",
        description: "Manage encrypted secrets with age and gpg keys.",
      },
      {
        name: "skill-two",
        description: "Manage encrypted secrets with age and gpg keys.",
      },
    ]);

    const results = await validateRoutingOverlap(claudePluginDir);
    expect(results.length).toBe(1);
    expect(results[0]?.valid).toBe(false);
  });
});
